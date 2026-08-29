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
    // 4. Check for existing subscription in local DB mirror
    const existingSub = await billingRepo.findFullSubscriptionByTeam(teamId)
    const activeStatuses: SubscriptionStatus[] = [SubscriptionStatus.active, SubscriptionStatus.trialing]

    if (existingSub && activeStatuses.includes(existingSub.status)) {
      // 4a. If team ALREADY has an active/trialing subscription for the EXACT SAME plan -> 409 Conflict
      if (existingSub.plan === planId && existingSub.billingInterval === interval) {
        logger.warn(
          { teamId, planId, paddleSubscriptionId: existingSub.paddleSubscriptionId, status: existingSub.status },
          '[billing.service] Checkout rejected: Team already has an active subscription for requested plan and interval'
        )
        throw new AppError(
          'ACTIVE_SUBSCRIPTION_EXISTS',
          409,
          `Team already has an active subscription for the '${planId}' plan (${interval}ly)`
        )
      }

      // 4b. Plan Change (e.g. STARTER -> GROWTH): Update existing Paddle subscription
      logger.info(
        {
          teamId,
          currentPlan: existingSub.plan,
          newPlan: planId,
          paddleSubscriptionId: existingSub.paddleSubscriptionId,
        },
        '[billing.service] Existing active subscription found — updating Paddle subscription'
      )

      let updatedSub: any
      try {
        updatedSub = await paddleClient.updateSubscriptionPlan({
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

      // Only update local state if Paddle returns active or trialing status
      if (updatedSub?.status === 'active' || updatedSub?.status === 'trialing') {
        const currentBillingPeriod = updatedSub.currentBillingPeriod || updatedSub.current_billing_period
        const periodStart = currentBillingPeriod?.startsAt ? new Date(currentBillingPeriod.startsAt) : undefined
        const periodEnd   = currentBillingPeriod?.endsAt ? new Date(currentBillingPeriod.endsAt) : undefined

        const trialDates = updatedSub.trialDates || updatedSub.trial_dates
        const trialStart = trialDates?.startsAt ? new Date(trialDates.startsAt) : undefined
        const trialEnd   = trialDates?.endsAt ? new Date(trialDates.endsAt) : undefined

        const rawUnit = updatedSub.items?.[0]?.price?.unitPrice?.amount || updatedSub.items?.[0]?.price?.unit_price?.amount
        const { getPlanPriceCents } = await import('../../config/plans.config')
        const unitAmount = rawUnit ? Number(rawUnit) : getPlanPriceCents(planId, interval)

        const currency = (updatedSub.currencyCode || updatedSub.currency_code || 'usd').toLowerCase()
        const cancelAtPeriodEnd = Boolean(updatedSub.scheduledChange?.action === 'cancel' || updatedSub.scheduled_change?.action === 'cancel')

        await billingRepo.updateSubscriptionTransaction(teamId, planId, {
          paddleSubscriptionId: existingSub.paddleSubscriptionId,
          paddleCustomerId: existingSub.paddleCustomerId,
          paddlePriceId: priceId,
          plan: planId,
          billingInterval: interval,
          status: updatedSub.status === 'trialing' ? SubscriptionStatus.trialing : SubscriptionStatus.active,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd,
          trialStart,
          trialEnd,
          unitAmount,
          currency,
        })
        await invalidatePlanCache(teamId)

        // Emit real-time socket event
        try {
          const { socketEmitter } = await import('../../realtime/socket.emitter')
          const { SERVER_EVENTS } = await import('../../realtime/socket.events')
          socketEmitter.to(`team:${teamId}`).emit(SERVER_EVENTS.BILLING_PLAN_UPDATED, {
            teamId,
            plan: planId,
            status: updatedSub.status === 'trialing' ? SubscriptionStatus.trialing : SubscriptionStatus.active,
            updatedAt: new Date().toISOString(),
          })
        } catch (err: any) {
          logger.warn({ err: err.message, teamId }, '[billing.service] Failed to emit socket event on plan update')
        }
      }

      return {
        transactionId: existingSub.paddleSubscriptionId,
        checkoutUrl: null,
      }
    }

    // 5. New Purchase / Renewal (no active subscription exists)
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
 */
export async function getUsage(teamId: string): Promise<UsageDetail> {
  const { prisma } = await import('../../db/client')
  const [teamData, inFlightMeetings] = await Promise.all([
    billingRepo.getTeamForUsage(teamId),
    prisma.meeting.count({
      where: {
        teamId,
        status: { in: IN_FLIGHT_STATUSES },
      },
    }),
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

  const plan = teamData.plan
  const meetingsUsed = teamData.meetingsUsed + inFlightMeetings
  const membersCount = teamData._count.members
  const billingCycleEnd = teamData.billingCycleEnd ?? null

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
 * Cancel the team's active subscription at period end via Paddle SDK.
 */
export async function cancelSubscription(teamId: string): Promise<{ success: boolean; cancelAt: Date | null }> {
  const sub = await billingRepo.findFullSubscriptionByTeam(teamId)
  if (!sub || (sub.status !== SubscriptionStatus.active && sub.status !== SubscriptionStatus.trialing)) {
    throw new AppError('NO_ACTIVE_SUBSCRIPTION', 400, 'No active subscription found to cancel.')
  }

  try {
    const { paddle } = await import('../../services/paddle.client')
    await paddle.subscriptions.cancel(sub.paddleSubscriptionId, {
      effectiveFrom: 'next_billing_period',
    })

    const currentPeriodEnd = sub.currentPeriodEnd ?? new Date()

    const { prisma } = await import('../../db/client')
    await prisma.subscription.update({
      where: { teamId },
      data: {
        cancelAtPeriodEnd: true,
      },
    })

    await billingRepo.createBillingAuditLog({
      teamId,
      eventType: 'subscription.cancel_requested',
      action: 'SCHEDULE_CANCEL_PERIOD_END',
      payload: { paddleSubscriptionId: sub.paddleSubscriptionId, effectiveFrom: 'next_billing_period' },
    })

    await invalidatePlanCache(teamId)

    return { success: true, cancelAt: currentPeriodEnd }
  } catch (err: any) {
    logger.error({ err: err.message, teamId, paddleSubId: sub.paddleSubscriptionId }, 'Paddle cancel failed')
    throw new AppError('PADDLE_CANCEL_FAILED', 502, `Failed to cancel subscription: ${err.message}`)
  }
}

/**
 * Retrieve Paddle Invoice PDF download URL or hosted invoice link.
 */
export async function getInvoicePdf(teamId: string, invoiceId: string): Promise<{ url: string | null }> {
  const { prisma } = await import('../../db/client')
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, teamId },
  })

  if (!invoice) {
    throw new AppError('INVOICE_NOT_FOUND', 404, 'Invoice not found')
  }

  if (invoice.hostedInvoiceUrl) {
    return { url: invoice.hostedInvoiceUrl }
  }

  try {
    const { paddle } = await import('../../services/paddle.client')
    const txn = await paddle.transactions.get(invoice.paddleTransactionId)
    const pdfUrl = (txn as any).invoice_url ?? (txn as any).details?.invoice_url ?? invoice.hostedInvoiceUrl
    return { url: pdfUrl ?? invoice.hostedInvoiceUrl }
  } catch (err: any) {
    logger.warn({ err: err.message, invoiceId }, 'Failed to fetch PDF URL from Paddle API')
    return { url: invoice.hostedInvoiceUrl }
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
    const { getPlanFromPriceId, getPlanPriceCents } = await import('../../config/plans.config')

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
        const interval = priceMatch?.interval ?? ((activeSub.customData as any)?.interval ?? 'month')
        const currentBillingPeriod = activeSub.currentBillingPeriod || (activeSub as any).current_billing_period
        const periodStart = currentBillingPeriod?.startsAt ? new Date(currentBillingPeriod.startsAt) : new Date()
        const periodEnd   = currentBillingPeriod?.endsAt ? new Date(currentBillingPeriod.endsAt) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

        const trialDates = (activeSub as any).trialDates || (activeSub as any).trial_dates
        const trialPeriodConfig = (activeSub.items?.[0] as any)?.price?.trial_period || (activeSub.items?.[0] as any)?.price?.trialPeriod
        const isTrialing = activeSub.status === 'trialing' || Boolean(trialDates) || Boolean(trialPeriodConfig)

        const status = isTrialing ? SubscriptionStatus.trialing : SubscriptionStatus.active

        let trialStart = trialDates?.startsAt ? new Date(trialDates.startsAt) : undefined
        let trialEnd   = trialDates?.endsAt ? new Date(trialDates.endsAt) : undefined
        if (isTrialing) {
          if (!trialStart) trialStart = periodStart
          if (!trialEnd) trialEnd = (activeSub as any).next_billed_at ? new Date((activeSub as any).next_billed_at) : new Date(trialStart.getTime() + 14 * 24 * 60 * 60 * 1000)
        }

        const rawUnit = activeSub.items?.[0]?.price?.unitPrice?.amount || (activeSub.items?.[0] as any)?.price?.unit_price?.amount
        const unitAmount = rawUnit ? Number(rawUnit) : getPlanPriceCents(resolvedPlan, interval)

        const currency = (activeSub.currencyCode || (activeSub as any).currency_code || 'usd').toLowerCase()
        const cancelAtPeriodEnd = Boolean(activeSub.scheduledChange?.action === 'cancel' || (activeSub as any).scheduled_change?.action === 'cancel')

        await billingRepo.activateSubscriptionTransaction(
          teamId,
          resolvedPlan,
          {
            paddleSubscriptionId: activeSub.id,
            paddleCustomerId: team.paddleCustomerId,
            paddlePriceId: priceId,
            plan: resolvedPlan,
            billingInterval: interval,
            status,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd,
            trialStart,
            trialEnd,
            unitAmount,
            currency,
          },
          null,
          periodStart,
          periodEnd
        )

        await invalidatePlanCache(teamId)

        // Emit real-time socket event
        try {
          const { socketEmitter } = await import('../../realtime/socket.emitter')
          const { SERVER_EVENTS } = await import('../../realtime/socket.events')
          socketEmitter.to(`team:${teamId}`).emit(SERVER_EVENTS.BILLING_PLAN_UPDATED, {
            teamId,
            plan: resolvedPlan,
            status,
            updatedAt: new Date().toISOString(),
          })
        } catch (err: any) {
          logger.warn({ err: err.message, teamId }, '[billing.service] Failed to emit socket event on sync')
        }

        return { synced: true, plan: resolvedPlan }
      }
    }
  } catch (err: any) {
    logger.error({ err: err?.message || err, teamId }, '[billing.service] Failed to sync subscription from Paddle API')
  }

  await invalidatePlanCache(teamId)
  return { synced: false, plan: team.plan }
}
