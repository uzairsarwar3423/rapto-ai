// ─────────────────────────────────────────────────────────────────────────────
// paddle.webhook.ts — Paddle Webhook Handler (6 Real Events)
//
// SECURITY DISCIPLINE (non-negotiable):
//   1. Raw body MUST be used for signature verification (never parsed body)
//   2. timingSafeEqual — NEVER === for signature comparison
//   3. Timestamp tolerance enforced (5 minutes) — replay attack prevention
//   4. teamId resolved ONLY from custom_data — the trust anchor
//      NEVER from any other payload field, query param, or header
//   5. Redis idempotency key checked BEFORE any handler logic runs
//   6. Fast-ack: 200 OK returned immediately; all side effects are async
//
// EVENT MAP (Paddle's actual taxonomy, not Stripe renames):
//   transaction.completed       → New sub + renewals (Stripe: checkout.session.completed)
//   subscription.created        → Period fields capture (Stripe: customer.subscription.created)
//   subscription.updated        → Upgrades + downgrades (Stripe: customer.subscription.updated)
//   subscription.canceled       → Downgrade to FREE (Stripe: customer.subscription.deleted)
//   transaction.payment_failed  → Failed payment (Stripe: invoice.payment_failed)
//   subscription status=trialing → Trial handling (checked on created/updated events)
// ─────────────────────────────────────────────────────────────────────────────

import type { Request, Response } from 'express'
import { PlanType, SubscriptionStatus } from '@prisma/client'
import { logger } from '../../config/logger'
import { redis } from '../../config/redis'
import { notifyQueue } from '../../queues/queue.client'
import { PADDLE_PRICE_REVERSE_MAP } from '../../config/plans.config'
import * as billingRepo from '../billing/billing.repository'
import { invalidatePlanCache } from '../../middleware/plan-limits.middleware'
import type { PaddleWebhookCustomData } from '../billing/billing.types'

// ── Constants ──────────────────────────────────────────────────────────────────

// (Removed top-level secret evaluation to prevent dotenv hoisting bugs)

// ── Main Handler ───────────────────────────────────────────────────────────────

export async function handlePaddleWebhook(req: Request, res: Response): Promise<void> {
  const PADDLE_WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET ?? ''
  
  // 1. Signature verification — MUST use rawBody, never req.body
  const signatureHeader = req.headers['paddle-signature'] as string
  const rawBody = (req as any).rawBody as Buffer

  if (!signatureHeader || !rawBody) {
    logger.warn('[paddle.webhook] Missing Paddle-Signature header or raw body')
    res.status(400).json({ error: 'Invalid request' })
    return
  }

  // 2. Signature verification and Event Parsing via Official SDK
  let event: any
  try {
    const { paddle } = await import('../../services/paddle.client')
    
    logger.debug({
      secretLength: PADDLE_WEBHOOK_SECRET.length,
      secretPrefix: PADDLE_WEBHOOK_SECRET.substring(0, 15),
      signatureHeader,
      bodyPrefix: rawBody.toString('utf8').substring(0, 100)
    }, '[paddle.webhook] Debugging webhook unmarshal variables');

    event = await paddle.webhooks.unmarshal(rawBody.toString('utf8'), PADDLE_WEBHOOK_SECRET, signatureHeader)
  } catch (err: any) {
    // Log as SECURITY event — not a normal application error
    logger.error(
      { err: err.message, ip: req.ip },
      '[paddle.webhook] SECURITY: Paddle signature verification FAILED'
    )
    res.status(400).json({ error: 'PADDLE_WEBHOOK_INVALID_SIGNATURE' })
    return
  }

  // The SDK class might map these to camelCase
  const eventId   = (event?.eventId || event?.event_id || event?.id) as string | undefined
  const eventType = (event?.eventType || event?.event_type || event?.type) as string | undefined

  // Handle Paddle's dummy webhook ping (sent when you save the URL in dashboard)
  if (!eventId && !eventType) {
    logger.info({ eventKeys: Object.keys(event || {}) }, '[paddle.webhook] Received Paddle test/ping webhook — acknowledging')
    res.status(200).json({ received: true })
    return
  }

  if (!eventId || !eventType) {
    logger.warn({ eventKeys: Object.keys(event || {}) }, '[paddle.webhook] Webhook payload missing eventId or eventType')
    res.status(400).json({ error: 'Malformed event' })
    return
  }

  // 3. Idempotency check — BEFORE any handler logic
  const idempotencyKey = `paddle:event:${eventId}`
  const isNew = await redis.set(idempotencyKey, '1', 'EX', 86400, 'NX')
  if (!isNew) {
    logger.info({ eventId, eventType }, '[paddle.webhook] Already processed — skipping (idempotent no-op)')
    res.status(200).json({ received: true })
    return
  }

  // 4. Fast-ack — return 200 IMMEDIATELY, process async
  res.status(200).json({ received: true })

  // 5. Route to correct handler (async, after ack)
  setImmediate(async () => {
    try {
      logger.info({ eventId, eventType }, '[paddle.webhook] Processing event')

      switch (eventType) {
        case 'transaction.completed':
          await handleTransactionCompleted(event.data)
          break
        case 'subscription.created':
          await handleSubscriptionCreated(event.data)
          break
        case 'subscription.updated':
          await handleSubscriptionUpdated(event.data)
          break
        case 'subscription.canceled':
          await handleSubscriptionCanceled(event.data)
          break
        case 'transaction.payment_failed':
          await handleTransactionPaymentFailed(event.data)
          break
        default:
          logger.debug({ eventType }, '[paddle.webhook] Unhandled event type — ignoring')
      }
    } catch (err) {
      // Log but don't crash — webhook ack already sent
      logger.error({ err, eventId, eventType }, '[paddle.webhook] Error processing event asynchronously')
    }
  })
}

// ── Event Handlers ─────────────────────────────────────────────────────────────

/**
 * transaction.completed — Fires on first checkout + every renewal
 *
 * This is the PRIMARY billing state change event:
 *   1. Resolve teamId/planId from custom_data (the trust anchor — never any other field)
 *   2. Create/update subscription row
 *   3. Update team.plan + reset meetingsUsed (both on first checkout AND renewals)
 *   4. Upsert invoice row with status='paid'
 *   5. Invalidate plan cache
 *   6. Queue confirmation email
 */
async function handleTransactionCompleted(data: any): Promise<void> {
  const customData = (data.customData || data.custom_data) as PaddleWebhookCustomData | undefined

  if (!customData?.teamId || !customData?.planId) {
    logger.error(
      { transactionId: data.id, keys: Object.keys(data) },
      '[paddle.webhook] transaction.completed: missing teamId or planId in custom_data — SKIPPING'
    )
    return
  }

  const teamId   = customData.teamId
  const planId   = customData.planId as PlanType
  const interval = customData.interval ?? 'month'

  // Validate planId is a real enum value — belt-and-suspenders
  if (!Object.values(PlanType).includes(planId)) {
    logger.error({ teamId, planId }, '[paddle.webhook] transaction.completed: invalid planId in custom_data')
    return
  }

  const paddleSubscriptionId = (data.subscriptionId || data.subscription_id) as string
  const paddleCustomerId     = (data.customerId || data.customer_id) as string
  const transactionId        = data.id as string

  // Resolve billing period
  const billingPeriod = data.billingPeriod || data.billing_period
  const periodStart = billingPeriod?.startsAt || billingPeriod?.starts_at ? new Date(billingPeriod.startsAt || billingPeriod.starts_at) : undefined
  const periodEnd   = billingPeriod?.endsAt || billingPeriod?.ends_at   ? new Date(billingPeriod.endsAt || billingPeriod.ends_at)   : undefined

  // 1. Upsert subscription row (if subscriptionId is present — may be absent for one-time purchases)
  if (paddleSubscriptionId) {
    await billingRepo.upsertSubscription(teamId, {
      paddleSubscriptionId,
      paddleCustomerId,
      plan: planId,
      billingInterval: interval,
      status: SubscriptionStatus.active,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      unitAmount: data.details?.totals?.subtotal ? parseInt(data.details.totals.subtotal) : undefined,
      currency: data.currency_code ?? 'usd',
    })
  }

  // 2. Activate team plan + reset meetings counter
  await billingRepo.activateTeamPlan(
    teamId,
    planId,
    periodStart ?? new Date(),
    periodEnd ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  )

  // 3. Upsert invoice
  const totals = data.details?.totals
  if (totals) {
    await billingRepo.upsertInvoice(teamId, transactionId, {
      paddleCustomerId,
      amountDue: parseInt(totals.total ?? '0'),
      amountPaid: parseInt(totals.total ?? '0'),
      currency: data.currency_code ?? 'usd',
      status: 'paid',
      periodStart,
      periodEnd,
      hostedInvoiceUrl: data.payments?.[0]?.method_details?.card ? null : (data.invoice_url ?? null),
      paidAt: new Date(),
    })
  }

  // 4. Invalidate plan cache — SAME KEY as plan-limits.middleware (intentional shared key)
  await invalidatePlanCache(teamId)

  // 5. Queue confirmation email via notify infra (never inline — fast-ack principle)
  await notifyQueue.add('billing-confirmation', {
    type: 'BILLING_CONFIRMATION',
    teamId,
    planId,
  })

  logger.info({ teamId, planId, transactionId }, '[paddle.webhook] transaction.completed — team plan activated')
}

/**
 * subscription.created — Captures period fields after transaction.completed
 *
 * Paddle may fire this slightly after transaction.completed with the full
 * subscription metadata. We upsert subscription row with any period/status data
 * present on this event that may not have been fully populated on the transaction.
 */
async function handleSubscriptionCreated(data: any): Promise<void> {
  const customData = (data.customData || data.custom_data) as PaddleWebhookCustomData | undefined
  const paddleSubscriptionId = data.id as string
  const paddleCustomerId = (data.customerId || data.customer_id) as string
  const status = mapPaddleSubscriptionStatus(data.status as string)

  if (!customData?.teamId) {
    logger.warn({ subscriptionId: paddleSubscriptionId }, '[paddle.webhook] subscription.created: no teamId in custom_data')
    return
  }

  const teamId   = customData.teamId
  const planId   = customData.planId as PlanType ?? PlanType.FREE
  const interval = customData.interval ?? 'month'

  const scheduledChange = data.scheduledChange || data.scheduled_change
  const currentBillingPeriod = data.currentBillingPeriod || data.current_billing_period
  
  const periodStart = currentBillingPeriod?.startsAt || currentBillingPeriod?.starts_at ? new Date(currentBillingPeriod.startsAt || currentBillingPeriod.starts_at) : undefined
  const periodEnd   = currentBillingPeriod?.endsAt || currentBillingPeriod?.ends_at ? new Date(currentBillingPeriod.endsAt || currentBillingPeriod.ends_at) : undefined

  // Check for trialing state
  if (data.status === 'trialing') {
    await notifyQueue.add('trial-started', {
      type: 'TRIAL_STARTED',
      teamId,
      trialEndsAt: periodEnd,
    })
    logger.info({ teamId }, '[paddle.webhook] subscription.created: trial started — notification queued')
  }

  const trialDates = data.trialDates || data.trial_dates
  const items = data.items || []
  const price = items?.[0]?.price
  const unitPrice = price?.unitPrice || price?.unit_price
  const currencyCode = data.currencyCode || data.currency_code

  await billingRepo.upsertSubscription(teamId, {
    paddleSubscriptionId,
    paddleCustomerId,
    paddlePriceId: price?.id,
    plan: planId,
    billingInterval: interval,
    status,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: !!scheduledChange,
    trialStart: trialDates?.startsAt || trialDates?.starts_at ? new Date(trialDates.startsAt || trialDates.starts_at) : undefined,
    trialEnd: trialDates?.endsAt || trialDates?.ends_at ? new Date(trialDates.endsAt || trialDates.ends_at) : undefined,
    unitAmount: unitPrice?.amount ? parseInt(unitPrice.amount) : undefined,
    currency: currencyCode ?? 'usd',
  })

  logger.info({ teamId, status }, '[paddle.webhook] subscription.created — subscription row upserted')
}

/**
 * subscription.updated — Upgrades AND downgrades (single event for both)
 *
 * Critical: resolve new plan from priceId via PADDLE_PRICE_REVERSE_MAP (O(1)).
 * If priceId is not in the map (e.g., custom enterprise price), log a warning
 * and leave team.plan UNCHANGED — never corrupt the plan field with a lookup miss.
 */
async function handleSubscriptionUpdated(data: any): Promise<void> {
  const customData = (data.customData || data.custom_data) as PaddleWebhookCustomData | undefined
  const subscriptionId = data.id as string

  // Resolve teamId from custom_data — the trust anchor
  let teamId = customData?.teamId
  if (!teamId) {
    logger.warn({ subscriptionId }, '[paddle.webhook] subscription.updated: no teamId in custom_data')
    return
  }

  const currentBillingPeriod = data.currentBillingPeriod || data.current_billing_period
  const scheduledChange = data.scheduledChange || data.scheduled_change

  const items = data.items || []
  const price = items?.[0]?.price
  const priceId = price?.id as string | undefined
  const priceEntry = priceId ? PADDLE_PRICE_REVERSE_MAP.get(priceId) : undefined

  if (priceId && !priceEntry) {
    // Unknown price ID — don't corrupt team.plan, just update subscription fields
    logger.warn(
      { teamId, priceId, subscriptionId },
      '[paddle.webhook] subscription.updated: priceId not in PADDLE_PRICE_REVERSE_MAP — plan field unchanged'
    )
  }

  const newPlan   = priceEntry?.planId
  const interval  = priceEntry?.interval ?? (customData?.interval ?? 'month')
  const status    = mapPaddleSubscriptionStatus(data.status as string)
  
  const unitPrice = price?.unitPrice || price?.unit_price
  const currencyCode = data.currencyCode || data.currency_code
  const paddleCustomerId = (data.customerId || data.customer_id) as string

  // Update subscription row
  await billingRepo.upsertSubscription(teamId, {
    paddleSubscriptionId: subscriptionId,
    paddleCustomerId,
    paddlePriceId: priceId,
    plan: newPlan ?? (customData?.planId as PlanType) ?? PlanType.FREE,
    billingInterval: interval,
    status,
    currentPeriodStart: currentBillingPeriod?.startsAt || currentBillingPeriod?.starts_at ? new Date(currentBillingPeriod.startsAt || currentBillingPeriod.starts_at) : undefined,
    currentPeriodEnd: currentBillingPeriod?.endsAt || currentBillingPeriod?.ends_at ? new Date(currentBillingPeriod.endsAt || currentBillingPeriod.ends_at) : undefined,
    cancelAtPeriodEnd: !!scheduledChange,
    unitAmount: unitPrice?.amount ? parseInt(unitPrice.amount) : undefined,
    currency: currencyCode ?? 'usd',
  })

  // Update team.plan if we successfully resolved a new plan
  if (newPlan) {
    await billingRepo.updateTeamPlan(teamId, newPlan)
    await invalidatePlanCache(teamId)
    logger.info({ teamId, oldPlan: customData?.planId, newPlan, status }, '[paddle.webhook] subscription.updated — plan changed')
  } else {
    logger.info({ teamId, status }, '[paddle.webhook] subscription.updated — subscription fields updated, plan unchanged')
  }
}

/**
 * subscription.canceled — Downgrade team to FREE
 *
 * Historical data (meetings, commitments, action items) is NEVER deleted.
 * Only team.plan is set to FREE and subscription.status to CANCELLED.
 */
async function handleSubscriptionCanceled(data: any): Promise<void> {
  const customData = (data.customData || data.custom_data) as PaddleWebhookCustomData | undefined
  const subscriptionId = data.id as string

  const teamId = customData?.teamId
  if (!teamId) {
    logger.warn({ subscriptionId }, '[paddle.webhook] subscription.canceled: no teamId in custom_data')
    return
  }

  const canceledAtRaw = data.canceledAt || data.canceled_at
  const cancelledAt = canceledAtRaw ? new Date(canceledAtRaw) : new Date()

  // Mark subscription cancelled
  try {
    await billingRepo.markSubscriptionCancelled(subscriptionId, cancelledAt)
  } catch (err) {
    // If subscription row doesn't exist yet (edge case), log and continue
    logger.warn({ err, subscriptionId }, '[paddle.webhook] subscription.canceled: subscription row not found — skipping markCancelled')
  }

  // Downgrade team to FREE (historical data untouched)
  await billingRepo.downgradeTeamToFree(teamId)

  // Invalidate plan cache
  await invalidatePlanCache(teamId)

  // Queue cancellation email
  await notifyQueue.add('subscription-cancelled', {
    type: 'SUBSCRIPTION_CANCELLED',
    teamId,
  })

  logger.info({ teamId, subscriptionId }, '[paddle.webhook] subscription.canceled — team downgraded to FREE, history preserved')
}

/**
 * transaction.payment_failed — Payment failure handling
 *
 * Paddle handles its own dunning/retry schedule (configured in the Paddle dashboard).
 * Vocaply ONLY reacts to failures — never reimplements retry logic.
 * If Paddle eventually cancels after retries, that arrives as subscription.canceled (above).
 */
async function handleTransactionPaymentFailed(data: any): Promise<void> {
  const customData = (data.customData || data.custom_data) as PaddleWebhookCustomData | undefined
  const transactionId = data.id as string

  const teamId = customData?.teamId
  if (!teamId) {
    logger.warn({ transactionId }, '[paddle.webhook] transaction.payment_failed: no teamId in custom_data')
    return
  }

  // Upsert invoice with failed status
  const totals = data.details?.totals
  if (totals) {
    await billingRepo.upsertInvoice(teamId, transactionId, {
      paddleCustomerId: (data.customerId || data.customer_id) as string,
      amountDue: parseInt(totals.total ?? '0'),
      amountPaid: 0,
      currency: (data.currencyCode || data.currency_code) ?? 'usd',
      status: 'past_due',
    })
  }

  // Queue payment-failed notification via shared notify infra — never inline
  await notifyQueue.add('payment-failed', {
    type: 'PAYMENT_FAILED',
    teamId,
    transactionId,
  })

  logger.warn({ teamId, transactionId }, '[paddle.webhook] transaction.payment_failed — invoice updated, notification queued')
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function mapPaddleSubscriptionStatus(paddleStatus: string): SubscriptionStatus {
  switch (paddleStatus) {
    case 'active':    return SubscriptionStatus.active
    case 'trialing':  return SubscriptionStatus.trialing
    case 'past_due':  return SubscriptionStatus.past_due
    case 'paused':    return SubscriptionStatus.paused
    case 'canceled':  return SubscriptionStatus.cancelled
    default:
      logger.warn({ paddleStatus }, '[paddle.webhook] Unknown Paddle subscription status — defaulting to ACTIVE')
      return SubscriptionStatus.active
  }
}
