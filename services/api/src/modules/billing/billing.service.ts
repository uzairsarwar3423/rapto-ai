// ─────────────────────────────────────────────────────────────────────────────
// billing.service.ts — Business Logic Layer
//
// RULES:
//   ✅ The ONLY layer that calls paddle.client.ts
//   ✅ Never imports express — zero HTTP knowledge
//   ✅ All reads go through billing.repository (local mirror) — never live Paddle API
//   ✅ Only checkout + portal require live Paddle calls (unavoidable — we need URLs)
// ─────────────────────────────────────────────────────────────────────────────

import { PlanType } from '@prisma/client'
import { logger } from '../../config/logger'
import { AppError } from '../../utils/errors'
import { redis } from '../../config/redis'
import { PLAN_LIMITS, PADDLE_PRICE_MAP } from '../../config/plans.config'
import * as paddleClient from '../../services/paddle.client'
import * as billingRepo from './billing.repository'
import type {
  CheckoutResult,
  PortalResult,
  SubscriptionDetail,
  UsageDetail,
  PaginatedInvoices,
  PlanDisplayItem,
} from './billing.types'

// ── Cache key — SAME as plan-limits.middleware to guarantee consistency ────────
function planCacheKey(teamId: string): string {
  return `cache:team:plan:${teamId}`
}

// ── Plans (no Paddle API — 100% local static config) ─────────────────────────

/**
 * Return all plans for the pricing display page.
 * Zero DB or Paddle API calls — pure config transform.
 * Response is edge-cached at CDN level for 1 hour.
 */
export function getPlans(): PlanDisplayItem[] {
  const planIds = [
    PlanType.FREE,
    PlanType.STARTER,
    PlanType.GROWTH,
    PlanType.BUSINESS,
    PlanType.ENTERPRISE,
  ]

  const PLAN_DISPLAY_NAMES: Record<PlanType, string> = {
    FREE: 'Free',
    STARTER: 'Starter',
    GROWTH: 'Growth',
    BUSINESS: 'Business',
    ENTERPRISE: 'Enterprise',
  }

  return planIds.map((id) => ({
    id,
    name: PLAN_DISPLAY_NAMES[id],
    monthlyPriceCents: PLAN_LIMITS[id].monthlyPriceCents,
    meetings: PLAN_LIMITS[id].meetings,
    members: PLAN_LIMITS[id].members,
    historyDays: PLAN_LIMITS[id].historyDays,
    storageGB: PLAN_LIMITS[id].storageGB,
    apiAccess: PLAN_LIMITS[id].apiAccess,
    ssoEnabled: PLAN_LIMITS[id].ssoEnabled,
  }))
}

// ── Checkout ──────────────────────────────────────────────────────────────────

interface CheckoutParams {
  teamId: string
  userId: string
  requesterEmail: string
  requesterName: string
  planId: PlanType
  interval: 'month' | 'year'
}

/**
 * Create a Paddle checkout transaction.
 *
 * Security: planId is validated against an explicit allow-list here.
 * The actual Paddle price ID is resolved SERVER-SIDE from PADDLE_PRICE_MAP —
 * the client never passes a raw price ID, only a validated planId.
 */
export async function createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
  const { teamId, requesterEmail, requesterName, planId, interval } = params

  // 1. Validate planId against allow-list (FREE and ENTERPRISE not allowed via checkout)
  const checkoutablePlans: PlanType[] = [PlanType.STARTER, PlanType.GROWTH, PlanType.BUSINESS]
  if (!checkoutablePlans.includes(planId)) {
    throw new AppError('PLAN_INVALID', 422, `Plan '${planId}' is not available for self-serve checkout`)
  }

  // 2. Resolve price ID server-side from config — NEVER from client input
  const priceMap = PADDLE_PRICE_MAP[planId as keyof typeof PADDLE_PRICE_MAP]
  if (!priceMap) {
    throw new AppError('PLAN_INVALID', 422, `No price configuration found for plan '${planId}'`)
  }
  const priceId = priceMap[interval]
  if (!priceId) {
    throw new AppError('PADDLE_CHECKOUT_FAILED', 502, `Missing Paddle price ID for ${planId}/${interval}`)
  }

  // 3. Get or create Paddle customer (DB-first, zero duplicates)
  let paddleCustomerId: string
  try {
    paddleCustomerId = await paddleClient.getOrCreatePaddleCustomer(teamId, requesterEmail, requesterName)
  } catch (err) {
    logger.error({ err, teamId }, '[billing.service] Failed to get/create Paddle customer')
    throw new AppError('PADDLE_CHECKOUT_FAILED', 502, 'Unable to initialize billing customer')
  }

  // 4. Create Paddle transaction (customData carries teamId/planId — the trust anchor)
  let result: CheckoutResult
  try {
    result = await paddleClient.createTransaction({
      priceId,
      customerId: paddleCustomerId,
      teamId,
      planId,
      interval,
    })
  } catch (err: any) {
    logger.error({ err, teamId, planId, interval }, '[billing.service] Paddle createTransaction failed')
    const paddleErrorMessage = err?.message || 'Unable to create checkout session'
    throw new AppError('PADDLE_CHECKOUT_FAILED', 502, `Paddle Error: ${paddleErrorMessage}`)
  }

  logger.info({ teamId, planId, interval, transactionId: result.transactionId }, '[billing.service] Checkout session created')
  return result
}

// ── Portal ─────────────────────────────────────────────────────────────────────

/**
 * Create a Paddle Customer Portal session for self-serve plan management.
 * Requires the team to have a paddleCustomerId (i.e., at least one prior checkout).
 */
export async function createPortalSession(teamId: string): Promise<PortalResult> {
  const team = await billingRepo.getTeamForUsage(teamId) as any

  // We need the paddleCustomerId — fetch it directly
  const { prisma } = await import('../../db/client')
  const teamRecord = await prisma.team.findUnique({
    where: { id: teamId },
    select: { paddleCustomerId: true },
  })

  if (!teamRecord?.paddleCustomerId) {
    throw new AppError('NO_BILLING_ACCOUNT', 404, 'No billing account found. Please complete a checkout first.')
  }

  let portalUrl: string
  try {
    portalUrl = await paddleClient.createCustomerPortalSession(teamRecord.paddleCustomerId)
  } catch (err: any) {
    logger.error({ err, teamId }, '[billing.service] Failed to create portal session')
    if (err?.code === 'not_found' || err?.status === 404) {
      throw new AppError('NO_BILLING_ACCOUNT', 404, 'Billing account not found on payment provider. Please complete a checkout first.')
    }
    throw new AppError('PADDLE_CHECKOUT_FAILED', 502, 'Unable to create billing portal session')
  }

  return { portalUrl }
}

// ── Subscription ──────────────────────────────────────────────────────────────

/**
 * Get subscription details from local mirror (never a live Paddle API call).
 * Returns null if team is on the free plan naturally (no subscription row).
 */
export async function getSubscription(teamId: string): Promise<SubscriptionDetail | null> {
  return billingRepo.findSubscriptionByTeam(teamId)
}

// ── Invoices ──────────────────────────────────────────────────────────────────

/**
 * Get paginated invoices from local mirror.
 */
export async function getInvoices(
  teamId: string,
  cursor: string | null,
  limit: number
): Promise<PaginatedInvoices> {
  return billingRepo.findInvoicesByTeam(teamId, cursor, limit)
}

// ── Usage ──────────────────────────────────────────────────────────────────────

/**
 * Get current usage for a team.
 *
 * PROVIDER-AGNOSTIC: this function has zero Paddle-specific logic.
 * It reads the same denormalized teams.meetingsUsed field and the same
 * Redis cache key (cache:team:plan:{teamId}) established by plan-limits.middleware.
 * The payment provider swap is completely invisible here.
 */
export async function getUsage(teamId: string): Promise<UsageDetail> {
  // Try Redis cache first — same key as plan-limits.middleware (intentional sharing)
  const cacheKey = planCacheKey(teamId)
  const cached = await redis.get(cacheKey)

  let meetingsUsed: number
  let plan: PlanType
  let billingCycleEnd: Date | null
  let membersCount: number

  if (cached) {
    const entry = JSON.parse(cached)
    meetingsUsed = entry.meetingsUsed
    plan = entry.plan
    billingCycleEnd = null // Not cached — fetch from DB on cache hit is acceptable
  }

  const teamData = await billingRepo.getTeamForUsage(teamId)
  if (!teamData) {
    return {
      meetingsUsed: 0,
      meetingsLimit: PLAN_LIMITS.FREE.meetings,
      membersCount: 0,
      membersLimit: PLAN_LIMITS.FREE.members,
      billingCycleEnd: null,
      percentUsed: 0,
    }
  }

  plan = teamData.plan
  meetingsUsed = teamData.meetingsUsed
  membersCount = teamData._count.members
  billingCycleEnd = teamData.billingCycleEnd ?? null

  const limits = PLAN_LIMITS[plan]
  const meetingsLimit = limits.meetings
  const membersLimit = limits.members

  const percentUsed = meetingsLimit === -1
    ? -1
    : Math.min(100, Math.round((meetingsUsed / meetingsLimit) * 100))

  return {
    meetingsUsed,
    meetingsLimit,
    membersCount,
    membersLimit,
    billingCycleEnd,
    percentUsed,
  }
}
