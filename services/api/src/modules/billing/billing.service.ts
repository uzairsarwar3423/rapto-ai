// ─────────────────────────────────────────────────────────────────────────────
// billing.service.ts — Business Logic Layer
//
// RULES:
//   ✅ The ONLY layer that calls paddle.client.ts
//   ✅ Never imports express — zero HTTP knowledge
//   ✅ All reads go through billing.repository (local mirror) — never live Paddle API
//   ✅ Only checkout + portal require live Paddle calls (unavoidable — we need URLs)
// ─────────────────────────────────────────────────────────────────────────────

import { PlanType, SubscriptionStatus } from '@prisma/client'
import { logger } from '../../config/logger'
import { AppError } from '../../utils/errors'
import { redis } from '../../config/redis'
import { PLAN_LIMITS, PADDLE_PRICE_MAP } from '../../config/plans.config'
import { invalidatePlanCache } from '../../middleware/plan-limits.middleware'
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

  // 3. Race Condition & Concurrency Defense: Acquire Redis lock for team checkout
  const lockKey = `lock:checkout:${teamId}`
  const acquiredLock = await redis.set(lockKey, '1', 'EX', 10, 'NX')
  if (!acquiredLock) {
    throw new AppError(
      'CHECKOUT_IN_PROGRESS',
      409,
      'A checkout or subscription operation is already in progress for this team. Please wait a moment.'
    )
  }

  try {
    // 4. Check for existing subscription in local DB mirror
    const existingSub = await billingRepo.findFullSubscriptionByTeam(teamId)
    const activeStatuses: SubscriptionStatus[] = [SubscriptionStatus.active, SubscriptionStatus.trialing]

    if (existingSub && activeStatuses.includes(existingSub.status)) {
      // 4a. If team ALREADY has an active/trialing subscription for the EXACT SAME plan -> 409 Conflict
      if (existingSub.plan === planId) {
        logger.warn(
          { teamId, planId, paddleSubscriptionId: existingSub.paddleSubscriptionId, status: existingSub.status },
          '[billing.service] Checkout rejected: Team already has an active subscription for requested plan'
        )
        throw new AppError(
          'ACTIVE_SUBSCRIPTION_EXISTS',
          409,
          `Team already has an active or trialing subscription for the '${planId}' plan`
        )
      }

      // 4b. Plan Change (STARTER -> GROWTH, GROWTH -> BUSINESS): Update existing Paddle subscription
      logger.info(
        {
          teamId,
          currentPlan: existingSub.plan,
          newPlan: planId,
          paddleSubscriptionId: existingSub.paddleSubscriptionId,
        },
        '[billing.service] Existing active subscription found for different plan — updating Paddle subscription'
      )

      try {
        await paddleClient.updateSubscriptionPlan({
          paddleSubscriptionId: existingSub.paddleSubscriptionId,
          priceId,
          planId,
          interval,
        })
      } catch (err: any) {
        logger.error(
          { err: err?.message || err, teamId, paddleSubscriptionId: existingSub.paddleSubscriptionId },
          '[billing.service] Failed to update Paddle subscription plan'
        )
        throw new AppError(
          'PADDLE_SUBSCRIPTION_UPDATE_FAILED',
          502,
          `Paddle Error: ${err?.message || 'Unable to update existing subscription plan'}`
        )
      }

      // Sync local DB mirror tables immediately (webhooks will also confirm)
      await billingRepo.upsertSubscription(teamId, {
        paddleSubscriptionId: existingSub.paddleSubscriptionId,
        paddleCustomerId: existingSub.paddleCustomerId,
        paddlePriceId: priceId,
        plan: planId,
        billingInterval: interval,
        status: existingSub.status,
      })
      await billingRepo.updateTeamPlan(teamId, planId)
      await invalidatePlanCache(teamId)

      // Emit real-time socket event for immediate UI reflection
      try {
        const { socketEmitter } = await import('../../realtime/socket.emitter')
        const { SERVER_EVENTS } = await import('../../realtime/socket.events')
        socketEmitter.to(`team:${teamId}`).emit(SERVER_EVENTS.BILLING_PLAN_UPDATED, {
          teamId,
          plan: planId,
          updatedAt: new Date().toISOString(),
        })
      } catch (err: any) {
        logger.warn({ err: err.message, teamId }, '[billing.service] Failed to emit socket event on plan update')
      }

      // Enqueue upgrade notification email
      try {
        const { notifyQueue } = await import('../../queues/queue.client')
        await notifyQueue.add(
          'subscription-upgraded',
          {
            type: 'SUBSCRIPTION_UPGRADED',
            teamId,
            planId,
            metadata: {
              newPlanName: planId,
              billingInterval: interval,
            },
          },
          { jobId: `subscription-upgraded:sub:${existingSub.paddleSubscriptionId}:${Date.now()}` }
        )
      } catch (queueErr: any) {
        logger.warn({ err: queueErr.message, teamId }, '[billing.service] Failed to queue upgrade notification email')
      }

      logger.info(
        { teamId, oldPlan: existingSub.plan, newPlan: planId, paddleSubscriptionId: existingSub.paddleSubscriptionId },
        '[billing.service] Paddle subscription updated successfully'
      )

      return {
        transactionId: existingSub.paddleSubscriptionId,
        checkoutUrl: null,
      }
    }

    // 5. New Purchase / Renewal (no active or trialing subscription exists; or existing is canceled/expired)
    let paddleCustomerId: string
    try {
      paddleCustomerId = await paddleClient.getOrCreatePaddleCustomer(teamId, requesterEmail, requesterName)
    } catch (err) {
      logger.error({ err, teamId }, '[billing.service] Failed to get/create Paddle customer')
      throw new AppError('PADDLE_CHECKOUT_FAILED', 502, 'Unable to initialize billing customer')
    }

    // 6. Create Paddle transaction (customData carries teamId/planId — trust anchor)
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
  } finally {
    // Release concurrency lock
    await redis.del(lockKey)
  }
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

/**
 * Direct Paddle Subscription Reconciliation / Manual Sync Endpoint.
 * Checks Paddle API directly for the team's customer ID and updates local DB state.
 */
export async function syncSubscription(teamId: string): Promise<{ synced: boolean; plan: PlanType }> {
  const { prisma } = await import('../../db/client')
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, plan: true, paddleCustomerId: true },
  })

  if (!team?.paddleCustomerId) {
    await invalidatePlanCache(teamId)
    return { synced: false, plan: team?.plan ?? PlanType.FREE }
  }

  try {
    const { paddle } = await import('../../services/paddle.client')
    const { getPlanFromPriceId } = await import('../../config/plans.config')
    const { SubscriptionStatus } = await import('@prisma/client')

    const collection = paddle.subscriptions.list({
      customerId: [team.paddleCustomerId],
      status: ['active', 'trialing'],
    })

    const activeSubs = await collection.next()

    if (activeSubs && activeSubs.length > 0) {
      const activeSub = activeSubs[0]
      const priceId = activeSub.items?.[0]?.price?.id
      const priceMatch = priceId ? getPlanFromPriceId(priceId) : undefined

      const customPlan = (activeSub.customData || (activeSub as any).custom_data)?.planId as PlanType | undefined
      const resolvedPlan = customPlan && Object.values(PlanType).includes(customPlan)
        ? customPlan
        : priceMatch?.planId

      if (resolvedPlan) {
        const periodStart = activeSub.currentBillingPeriod?.startsAt ? new Date(activeSub.currentBillingPeriod.startsAt) : new Date()
        const periodEnd = activeSub.currentBillingPeriod?.endsAt ? new Date(activeSub.currentBillingPeriod.endsAt) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

        await billingRepo.upsertSubscription(teamId, {
          paddleSubscriptionId: activeSub.id,
          paddleCustomerId: team.paddleCustomerId,
          paddlePriceId: priceId,
          plan: resolvedPlan,
          billingInterval: priceMatch?.interval ?? 'month',
          status: activeSub.status === 'trialing' ? SubscriptionStatus.trialing : SubscriptionStatus.active,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        })

        await billingRepo.activateTeamPlan(teamId, resolvedPlan, periodStart, periodEnd)
        await invalidatePlanCache(teamId)

        // Emit real-time socket event to team room
        try {
          const { socketEmitter } = await import('../../realtime/socket.emitter')
          const { SERVER_EVENTS } = await import('../../realtime/socket.events')
          socketEmitter.to(`team:${teamId}`).emit(SERVER_EVENTS.BILLING_PLAN_UPDATED, {
            teamId,
            plan: resolvedPlan,
            updatedAt: new Date().toISOString(),
          })
        } catch (err: any) {
          logger.warn({ err: err.message, teamId }, '[billing.service] Failed to emit billing socket event on sync')
        }

        // Enqueue confirmation email with deterministic jobId so it never duplicates with Webhook email
        try {
          const { notifyQueue } = await import('../../queues/queue.client')
          await notifyQueue.add(
            'billing-confirmation',
            {
              type: 'BILLING_CONFIRMATION',
              teamId,
              planId: resolvedPlan,
              metadata: {
                billingInterval: priceMatch?.interval ?? 'month',
                planId: resolvedPlan,
                syncedFromApi: true,
              },
            },
            { jobId: `billing-confirmation:sub:${activeSub.id}` }
          )
          logger.info({ teamId, plan: resolvedPlan }, '[billing.service] Billing confirmation email queued from sync')
        } catch (queueErr: any) {
          logger.error({ err: queueErr.message, teamId }, '[billing.service] Failed to queue confirmation email from sync')
        }

        logger.info({ teamId, plan: resolvedPlan }, '[billing.service] Subscription synced successfully from Paddle API')
        return { synced: true, plan: resolvedPlan }
      }
    }
  } catch (err: any) {
    logger.error({ err: err?.message || err, teamId }, '[billing.service] Failed to sync subscription from Paddle API')
  }

  await invalidatePlanCache(teamId)
  return { synced: false, plan: team.plan }
}
