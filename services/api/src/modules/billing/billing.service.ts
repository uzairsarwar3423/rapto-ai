// ─────────────────────────────────────────────────────────────────────────────
// billing.service.ts — Business Logic Layer
//
// RULES:
//   ✅ The ONLY layer that calls paddle.client.ts
//   ✅ Never imports express — zero HTTP knowledge
//   ✅ All reads go through billing.repository (local mirror) — never live Paddle API
//   ✅ Only checkout + portal require live Paddle calls (unavoidable — we need URLs)
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from 'node:crypto'
import { PlanType, SubscriptionStatus } from '@prisma/client'
import { logger } from '../../config/logger'
import { AppError } from '../../utils/errors'
import { redis } from '../../config/redis'
import { PLAN_LIMITS, PADDLE_PRICE_MAP } from '../../config/plans.config'
import { invalidatePlanCache } from '../../middleware/plan-limits.middleware'
import { IN_FLIGHT_STATUSES } from '../meetings/meetings.service.state'
import { withTimeout } from '../../utils/with-timeout'
import { getTeamEntitlement } from './entitlement.service'
import { entityToSnake, extractSubscriptionData } from '../webhooks/paddle.mapper'
import { reconcileTeamFromPaddle, assertNoLiveSubscriptionInPaddle } from './subscription-lifecycle.service'
import * as paddleClient from '../../services/paddle.client'
import * as billingRepo from './billing.repository'
import { isLiveSubscriptionStatus } from './entitlement'

const PADDLE_CALL_TIMEOUT_MS = 8_000
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

const RELEASE_LOCK_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
`

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
 * Create a Paddle checkout transaction or update an existing subscription.
 *
 * Concurrency Safety:
 *   - Uses a tokenized distributed lock (UUID) in Redis with atomic Lua release.
 *   - Validates planId against an explicit server-side allow-list.
 */
export async function createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
  const { teamId, requesterEmail, requesterName, planId, interval } = params

  // 1. Validate planId against allow-list (FREE and ENTERPRISE not allowed via self-serve checkout)
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

  // 3. Concurrency Defense: Acquire Redis lock for team checkout with unique token
  const lockKey = `lock:checkout:${teamId}`
  const lockToken = randomUUID()
  const acquiredLock = await redis.set(lockKey, lockToken, 'EX', 15, 'NX')
  if (!acquiredLock) {
    throw new AppError(
      'CHECKOUT_IN_PROGRESS',
      409,
      'A checkout or subscription operation is already in progress for this workspace. Please wait a moment.'
    )
  }

  try {
    // 4. Existing subscription in the local mirror
    const existingSub = await billingRepo.findFullSubscriptionByTeam(teamId)

    if (existingSub && isLiveSubscriptionStatus(existingSub.status)) {
      // 4a. past_due / paused: Paddle refuses plan updates in these states and a NEW checkout would create a second,
      //     parallel subscription. The customer must fix the payment method / resume in the Paddle portal.
      if (existingSub.status === SubscriptionStatus.past_due || existingSub.status === SubscriptionStatus.paused) {
        throw new AppError(
          'SUBSCRIPTION_NEEDS_ATTENTION',
          409,
          `Your subscription is ${existingSub.status === SubscriptionStatus.past_due ? 'past due' : 'paused'}. Please update your payment method or resume it from the billing portal.`
        )
      }

      // 4b. Same plan + interval → 409
      if (existingSub.plan === planId && existingSub.billingInterval === interval && !existingSub.cancelAtPeriodEnd) {
        logger.warn({ teamId, planId, paddleSubscriptionId: existingSub.paddleSubscriptionId, status: existingSub.status }, '[billing.service] Checkout rejected: active subscription already on requested plan')
        throw new AppError('ACTIVE_SUBSCRIPTION_EXISTS', 409, `Team already has an active subscription for the '${planId}' plan (${interval}ly)`)
      }

      // 4c. Plan change: update the existing Paddle subscription in place
      logger.info({ teamId, currentPlan: existingSub.plan, newPlan: planId, paddleSubscriptionId: existingSub.paddleSubscriptionId }, '[billing.service] updating Paddle subscription plan')

      let updatedSub: any
      try {
        updatedSub = await withTimeout(
          paddleClient.updateSubscriptionPlan({ paddleSubscriptionId: existingSub.paddleSubscriptionId, priceId, planId, interval, teamId }),
          PADDLE_CALL_TIMEOUT_MS,
          'paddle.subscriptions.update'
        )
      } catch (err: any) {
        logger.error({ err: err?.message || err, teamId, paddleSubscriptionId: existingSub.paddleSubscriptionId }, '[billing.service] Failed to update Paddle subscription plan')
        throw new AppError('PADDLE_SUBSCRIPTION_UPDATE_FAILED', 502, 'Unable to change the subscription plan right now. Please try again.')
      }

      // Local mirror is updated from Paddle's RESPONSE through the same single writer the webhooks use.
      // The following subscription.updated webhook is then an idempotent no-op / refinement.
      const snapshot = entityToSnake<any>(updatedSub)
      const data = extractSubscriptionData(snapshot, planId, interval)
      const applied = await billingRepo.applySubscriptionState({
        teamId,
        data,
        source: 'checkout',
        audit: { eventType: 'subscription.plan_change_requested', action: 'PLAN_CHANGED', payload: { from: existingSub.plan, to: planId, interval, paddleSubscriptionId: existingSub.paddleSubscriptionId } },
      })
      await invalidatePlanCache(teamId)
      try {
        const { socketEmitter } = await import('../../realtime/socket.emitter')
        const { SERVER_EVENTS } = await import('../../realtime/socket.events')
        socketEmitter.to(`team:${teamId}`).emit(SERVER_EVENTS.BILLING_PLAN_UPDATED, { teamId, plan: applied.entitlement?.plan ?? planId, updatedAt: new Date().toISOString() })
      } catch (err: any) {
        logger.warn({ err: err.message, teamId }, '[billing.service] socket emit failed (non-fatal)')
      }

      return {
        transactionId: existingSub.paddleSubscriptionId,
        checkoutUrl: null,
        updated: true,
        plan: applied.entitlement?.plan ?? planId,
        status: data.status,
      }
    }

    // 5. New purchase / re-subscription
    let paddleCustomerId: string
    try {
      paddleCustomerId = await paddleClient.getOrCreatePaddleCustomer(teamId, requesterEmail, requesterName)
    } catch (err) {
      logger.error({ err, teamId }, '[billing.service] Failed to get/create Paddle customer')
      throw new AppError('PADDLE_CHECKOUT_FAILED', 502, 'Unable to initialize billing customer')
    }

    // 5b. Ground truth check: never start a second paid subscription for a customer Paddle already bills.
    //     (Covers DB drift, lost webhooks, a second browser tab after the lock expired, past_due/paused states.)
    await assertNoLiveSubscriptionInPaddle(teamId, paddleCustomerId)

    // 6. Create Paddle transaction (customData carries teamId/planId — trust anchor)
    let result: CheckoutResult
    try {
      result = await withTimeout(
        paddleClient.createTransaction({ priceId, customerId: paddleCustomerId, teamId, planId, interval }),
        PADDLE_CALL_TIMEOUT_MS,
        'paddle.transactions.create'
      )
    } catch (err: any) {
      // Provider detail goes to the log only — never to the client.
      logger.error({ err: err?.message, teamId, planId, interval }, '[billing.service] Paddle createTransaction failed')
      throw new AppError('PADDLE_CHECKOUT_FAILED', 502, 'Unable to create checkout session. Please try again.')
    }

    logger.info({ teamId, planId, interval, transactionId: result.transactionId }, '[billing.service] Checkout session created')
    return result
  } finally {
    // Safe atomic release: only delete if lock still belongs to this token
    await redis.eval(RELEASE_LOCK_LUA, 1, lockKey, lockToken).catch((err) => {
      logger.warn({ err: err.message, lockKey }, '[billing.service] Failed to release checkout lock safely')
    })
  }
}

// ── Portal ─────────────────────────────────────────────────────────────────────

/**
 * Create a Paddle Customer Portal session for self-serve plan management.
 * Requires the team to have a paddleCustomerId (i.e., at least one prior checkout).
 */
export async function createPortalSession(teamId: string): Promise<PortalResult> {
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
 * Subscription as the customer is entitled to see it, from the local mirror (never a live Paddle call).
 * Returns null when the team is effectively on the Free plan — including an EXPIRED TRIAL, an ended cancellation,
 * a refund or an exhausted payment grace window — so the UI cannot keep showing a paid plan the backend no longer grants.
 */
export async function getSubscription(teamId: string): Promise<SubscriptionDetail | null> {
  const [row, entitlement] = await Promise.all([
    billingRepo.findSubscriptionByTeam(teamId),
    getTeamEntitlement(teamId),
  ])
  if (!row) return null
  if (entitlement.plan === PlanType.FREE) return null
  return { ...row, plan: entitlement.plan }
}

// ── Invoices ──────────────────────────────────────────────────────────────────

export async function getInvoices(
  teamId: string,
  cursor: string | null,
  limit: number
): Promise<PaginatedInvoices> {
  return billingRepo.findInvoicesByTeam(teamId, cursor, limit)
}

// ── Usage ──────────────────────────────────────────────────────────────────────

export async function getUsage(teamId: string): Promise<UsageDetail> {
  const { prisma } = await import('../../db/client')
  const [teamData, inFlightMeetings, entitlement] = await Promise.all([
    billingRepo.getTeamForUsage(teamId),
    prisma.meeting.count({ where: { teamId, status: { in: IN_FLIGHT_STATUSES } } }),
    getTeamEntitlement(teamId),
  ])

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

  const limits = PLAN_LIMITS[entitlement.plan]
  const meetingsUsed = teamData.meetingsUsed + inFlightMeetings
  const meetingsLimit = limits.meetings
  const percentUsed = meetingsLimit === -1 ? -1 : Math.min(100, Math.round((meetingsUsed / meetingsLimit) * 100))

  return {
    meetingsUsed,
    meetingsLimit,
    membersCount: teamData._count.members,
    membersLimit: limits.members,
    billingCycleEnd: entitlement.plan === PlanType.FREE ? null : teamData.billingCycleEnd ?? null,
    percentUsed,
  }
}

/**
 * Cancel the team's subscription at period end (for a trial: at trial end) via Paddle.
 * Idempotent: repeating the call on an already-scheduled cancellation succeeds without another Paddle write.
 * Paddle success and local-mirror failure are reported separately — Paddle is the source of truth, and the
 * subscription.updated webhook (or reconciliation) repairs a failed local write.
 */
export async function cancelSubscription(teamId: string): Promise<{ success: boolean; cancelAt: Date | null }> {
  const sub = await billingRepo.findFullSubscriptionByTeam(teamId)
  if (!sub || (sub.status !== SubscriptionStatus.active && sub.status !== SubscriptionStatus.trialing)) {
    throw new AppError('NO_ACTIVE_SUBSCRIPTION', 400, 'No active subscription found to cancel.')
  }

  const cancelAt = (sub.status === SubscriptionStatus.trialing ? sub.trialEnd : sub.currentPeriodEnd) ?? sub.currentPeriodEnd ?? null
  if (sub.cancelAtPeriodEnd) return { success: true, cancelAt }

  try {
    const { paddle } = await import('../../services/paddle.client')
    await withTimeout(
      paddle.subscriptions.cancel(sub.paddleSubscriptionId, { effectiveFrom: 'next_billing_period' }),
      PADDLE_CALL_TIMEOUT_MS,
      'paddle.subscriptions.cancel'
    )
  } catch (err: any) {
    logger.error({ err: err.message, teamId, paddleSubId: sub.paddleSubscriptionId }, 'Paddle cancel failed')
    throw new AppError('PADDLE_CANCEL_FAILED', 502, 'Failed to cancel the subscription. Please try again.')
  }

  try {
    const { prisma } = await import('../../db/client')
    await prisma.subscription.update({ where: { teamId }, data: { cancelAtPeriodEnd: true } })
    await billingRepo.createBillingAuditLog({
      teamId,
      eventType: 'subscription.cancel_requested',
      action: 'SCHEDULE_CANCEL_PERIOD_END',
      payload: { paddleSubscriptionId: sub.paddleSubscriptionId, effectiveFrom: 'next_billing_period' },
    })
    await invalidatePlanCache(teamId)
  } catch (err: any) {
    logger.error({ err: err.message, teamId, alert: 'billing.local_write_failed_after_paddle' }, 'Paddle cancel succeeded but the local mirror update failed — webhook/reconciliation will repair')
  }

  return { success: true, cancelAt }
}

/**
 * Invoice PDF link. Ownership is enforced by (id, teamId); the URL is fetched from Paddle on demand because
 * it is short-lived and must not be stored.
 */
export async function getInvoicePdf(teamId: string, invoiceId: string): Promise<{ url: string | null }> {
  const { prisma } = await import('../../db/client')
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, teamId } })
  if (!invoice) throw new AppError('INVOICE_NOT_FOUND', 404, 'Invoice not found')

  try {
    const { paddle } = await import('../../services/paddle.client')
    const pdf = await withTimeout(paddle.transactions.getInvoicePDF(invoice.paddleTransactionId), PADDLE_CALL_TIMEOUT_MS, 'paddle.transactions.getInvoicePDF')
    return { url: pdf.url ?? invoice.hostedInvoiceUrl ?? null }
  } catch (err: any) {
    logger.warn({ err: err.message, invoiceId }, 'Failed to fetch invoice PDF URL from Paddle API')
    return { url: invoice.hostedInvoiceUrl ?? null }
  }
}

/**
 * Manual reconciliation with Paddle for this team (also called automatically after checkout.completed).
 * Paddle is the source of truth: handles activation AND cancellation/pause/past_due. Never resets usage
 * unless a genuinely new billing period started.
 */
export async function syncSubscription(teamId: string): Promise<{ synced: boolean; plan: PlanType }> {
  const result = await reconcileTeamFromPaddle(teamId)
  await invalidatePlanCache(teamId)
  return { synced: result.synced, plan: result.plan }
}
