// ─────────────────────────────────────────────────────────────────────────────
// paddle.webhook.ts — Paddle Webhook Handler
//
// SECURITY DISCIPLINE (non-negotiable):
//   1. Raw body MUST be used for signature verification (never parsed body)
//   2. timingSafeEqual — NEVER === for signature comparison (handled by SDK)
//   3. Timestamp tolerance enforced by SDK — replay attack prevention
//   4. teamId resolved from custom_data with DB customer fallback — trust anchor
//   5. Redis idempotency key checked BEFORE any handler logic runs
//   6. Fast-ack: 200 OK returned immediately; all side effects run in setImmediate
//
// IDEMPOTENCY STRATEGY (dual-layer):
//   Layer 1 — Redis key `paddle:event:<eventId>` (24h TTL): prevents the same
//             Paddle event from being processed twice even if Paddle retries.
//   Layer 2 — BullMQ jobId `<type>:<transactionId|subscriptionId>`: prevents
//             duplicate queue jobs even if layer-1 Redis NX fails on a blip.
//
// OBSERVABILITY:
//   Every step of the billing lifecycle emits a structured log with:
//   { eventId, eventType, teamId, planId, transactionId, step, durationMs }
//   so logs can be grepped end-to-end for a single purchase.
//
// EVENT MAP (Paddle taxonomy):
//   transaction.completed      → New subscription + every renewal
//   subscription.created       → Captures period fields after transaction
//   subscription.updated       → Upgrades + downgrades
//   subscription.canceled      → Downgrade to FREE
//   transaction.payment_failed → Failed payment alert
// ─────────────────────────────────────────────────────────────────────────────

import type { Request, Response } from 'express'
import { PlanType, SubscriptionStatus } from '@prisma/client'
import { logger } from '../../config/logger'
import { redis } from '../../config/redis'
import { notifyQueue } from '../../queues/queue.client'
import { getPlanFromPriceId } from '../../config/plans.config'
import * as billingRepo from '../billing/billing.repository'
import { invalidatePlanCache } from '../../middleware/plan-limits.middleware'
import type { PaddleWebhookCustomData } from '../billing/billing.types'

// ── Main Handler ──────────────────────────────────────────────────────────────

export async function handlePaddleWebhook(req: Request, res: Response): Promise<void> {
  const PADDLE_WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET ?? ''
  const webhookStart = Date.now()

  // ── Step 1: Validate raw body + signature header presence ──────────────────
  const signatureHeader = req.headers['paddle-signature'] as string
  const rawBody = (req as any).rawBody as Buffer

  if (!signatureHeader || !rawBody) {
    logger.warn(
      { hasSignature: !!signatureHeader, hasRawBody: !!rawBody, ip: req.ip },
      '[paddle.webhook] REJECTED: missing Paddle-Signature header or raw body'
    )
    res.status(400).json({ error: 'Invalid request' })
    return
  }

  // ── Step 2: Signature verification via official Paddle SDK ─────────────────
  let event: any
  try {
    const { paddle } = await import('../../services/paddle.client')
    event = await paddle.webhooks.unmarshal(
      rawBody.toString('utf8'),
      PADDLE_WEBHOOK_SECRET,
      signatureHeader
    )
  } catch (err: any) {
    logger.error(
      { err: err.message, ip: req.ip, signatureHeader: signatureHeader.substring(0, 40) },
      '[paddle.webhook] SECURITY: Paddle signature verification FAILED — possible replay attack or misconfigured secret'
    )
    res.status(400).json({ error: 'PADDLE_WEBHOOK_INVALID_SIGNATURE' })
    return
  }

  const eventId   = (event?.eventId   || event?.event_id   || event?.id)   as string | undefined
  const eventType = (event?.eventType || event?.event_type || event?.type)  as string | undefined

  // Paddle sends a ping when you first save the webhook URL in the dashboard
  if (!eventId && !eventType) {
    logger.info(
      { eventKeys: Object.keys(event || {}), ip: req.ip },
      '[paddle.webhook] Received Paddle test/ping webhook — acknowledging'
    )
    res.status(200).json({ received: true })
    return
  }

  if (!eventId || !eventType) {
    logger.warn(
      { eventKeys: Object.keys(event || {}), ip: req.ip },
      '[paddle.webhook] Webhook payload missing eventId or eventType — rejecting'
    )
    res.status(400).json({ error: 'Malformed event' })
    return
  }

  // ── Step 3: Idempotency check (Layer 1 — Redis, 24h TTL) ──────────────────
  const idempotencyKey = `paddle:event:${eventId}`
  const isNew = await redis.set(idempotencyKey, '1', 'EX', 86400, 'NX')
  if (!isNew) {
    logger.info(
      { eventId, eventType },
      '[paddle.webhook] IDEMPOTENT SKIP: event already processed within 24h — no-op'
    )
    res.status(200).json({ received: true })
    return
  }

  await redis.set('paddle:last_webhook_received_at', Date.now().toString())

  logger.info(
    { eventId, eventType, ip: req.ip },
    '[paddle.webhook] ✅ Signature verified and event accepted — fast-acking Paddle'
  )

  // ── Step 4: Fast-ack — return 200 IMMEDIATELY before any async work ────────
  res.status(200).json({ received: true })

  // ── Step 5: Route to handler (async, AFTER ack) ────────────────────────────
  setImmediate(async () => {
    const handlerStart = Date.now()
    try {
      logger.info({ eventId, eventType }, '[paddle.webhook] ▶ Processing event asynchronously')

      switch (eventType) {
        case 'transaction.completed':
          await handleTransactionCompleted(event.data, eventId)
          break
        case 'subscription.created':
          await handleSubscriptionCreated(event.data, eventId)
          break
        case 'subscription.updated':
          await handleSubscriptionUpdated(event.data, eventId)
          break
        case 'subscription.canceled':
          await handleSubscriptionCanceled(event.data, eventId)
          break
        case 'transaction.payment_failed':
          await handleTransactionPaymentFailed(event.data, eventId)
          break
        default:
          logger.debug({ eventType, eventId }, '[paddle.webhook] Unhandled event type — skipping')
      }

      logger.info(
        { eventId, eventType, durationMs: Date.now() - handlerStart },
        '[paddle.webhook] ✅ Event processed successfully'
      )
    } catch (err: any) {
      logger.error(
        { err: err.message, stack: err.stack, eventId, eventType, durationMs: Date.now() - handlerStart },
        '[paddle.webhook] ❌ CRITICAL: Unhandled error in async event handler'
      )
    }
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Resilient resolution of teamId & planId.
 * Primary: custom_data.teamId (set at checkout time).
 * Fallback: DB lookup by paddleCustomerId (handles renewals where custom_data may differ).
 */
async function resolveTeamAndPlan(data: any): Promise<{
  teamId: string | null
  planId: PlanType | null
  interval: 'month' | 'year'
}> {
  const customData = (data.customData || data.custom_data) as PaddleWebhookCustomData | undefined

  let teamId: string | null = customData?.teamId || (customData as any)?.team_id || null

  const paddleCustomerId = (data.customerId || data.customer_id) as string | undefined

  if (!teamId && paddleCustomerId) {
    try {
      const { prisma } = await import('../../db/client')
      const team = await prisma.team.findFirst({
        where: { paddleCustomerId },
        select: { id: true },
      })
      if (team) {
        teamId = team.id
        logger.info(
          { paddleCustomerId, teamId },
          '[paddle.webhook] resolveTeamAndPlan: teamId resolved via paddleCustomerId DB fallback'
        )
      } else {
        logger.warn(
          { paddleCustomerId },
          '[paddle.webhook] resolveTeamAndPlan: paddleCustomerId not found in DB — teamId unresolvable'
        )
      }
    } catch (err: any) {
      logger.error(
        { err: err.message, paddleCustomerId },
        '[paddle.webhook] resolveTeamAndPlan: DB lookup failed'
      )
    }
  }

  let planId: PlanType | null = null
  const customPlan = customData?.planId as PlanType | undefined
  if (customPlan && Object.values(PlanType).includes(customPlan)) {
    planId = customPlan
  }

  const items   = data.items || []
  const priceId = items?.[0]?.price?.id || items?.[0]?.price_id || data.details?.line_items?.[0]?.price_id
  const priceMatch = priceId ? getPlanFromPriceId(priceId) : undefined

  if (!planId && priceMatch) {
    planId = priceMatch.planId
    logger.info(
      { priceId, planId },
      '[paddle.webhook] resolveTeamAndPlan: planId resolved via priceId lookup fallback'
    )
  }

  const interval = priceMatch?.interval ?? (customData?.interval ?? 'month')
  return { teamId, planId, interval }
}

function mapPaddleSubscriptionStatus(paddleStatus: string): SubscriptionStatus {
  switch (paddleStatus) {
    case 'active':   return SubscriptionStatus.active
    case 'trialing': return SubscriptionStatus.trialing
    case 'past_due': return SubscriptionStatus.past_due
    case 'paused':   return SubscriptionStatus.paused
    case 'canceled': return SubscriptionStatus.cancelled
    default:
      logger.warn({ paddleStatus }, '[paddle.webhook] Unknown Paddle subscription status — defaulting to ACTIVE')
      return SubscriptionStatus.active
  }
}

/**
 * Enqueue a billing notification job with full idempotency and observability.
 * Uses a deterministic jobId so Paddle retries never produce duplicate emails.
 * Wraps queue.add in its own try/catch with CRITICAL log for ops replay.
 */
async function enqueueBillingJob(
  jobName: string,
  jobData: object,
  jobId: string,
  context: { eventId: string; teamId: string; transactionId?: string }
): Promise<void> {
  try {
    await notifyQueue.add(jobName, jobData, {
      // BullMQ Layer-2 idempotency: same jobId = job silently skipped if already queued
      jobId,
    })
    logger.info(
      { jobName, jobId, ...context },
      `[paddle.webhook] ✅ Billing job enqueued: ${jobName}`
    )
  } catch (queueErr: any) {
    // Redis unavailable: log CRITICAL with full payload so ops can manually replay
    logger.error(
      {
        err: queueErr.message,
        jobName,
        jobId,
        jobData,
        ...context,
      },
      `[paddle.webhook] ⚠️ CRITICAL: failed to enqueue ${jobName} — manual replay required`
    )
  }
}

// ── Event Handlers ─────────────────────────────────────────────────────────────

/**
 * transaction.completed — Fires on new checkout AND every renewal.
 * This is the primary billing event that activates a team's plan.
 */
async function handleTransactionCompleted(data: any, eventId: string): Promise<void> {
  const step = (s: string) => logger.info({ eventId, step: s }, `[paddle.webhook][transaction.completed] ${s}`)

  const { teamId, planId, interval } = await resolveTeamAndPlan(data)
  step('team+plan resolved')

  if (!teamId || !planId) {
    logger.error(
      { transactionId: data.id, teamId, planId, customData: data.customData || data.custom_data },
      '[paddle.webhook][transaction.completed] ❌ Cannot resolve teamId or planId — ABORTING. Check custom_data at checkout.'
    )
    return
  }

  const paddleSubscriptionId = (data.subscriptionId || data.subscription_id) as string
  const paddleCustomerId     = (data.customerId || data.customer_id) as string
  const transactionId        = data.id as string

  const billingPeriod = data.billingPeriod || data.billing_period
  const periodStart   = billingPeriod?.startsAt || billingPeriod?.starts_at
    ? new Date(billingPeriod.startsAt || billingPeriod.starts_at)
    : undefined
  const periodEnd = billingPeriod?.endsAt || billingPeriod?.ends_at
    ? new Date(billingPeriod.endsAt || billingPeriod.ends_at)
    : undefined

  const totals = data.details?.totals
  const amountPaidCents = totals?.total ? parseInt(totals.total) : 0
  const currency        = data.currency_code ?? 'usd'

  logger.info(
    { eventId, transactionId, teamId, planId, interval, amountPaidCents, currency, paddleSubscriptionId },
    '[paddle.webhook][transaction.completed] ▶ Starting DB writes'
  )

  // ── DB Step 1: Upsert subscription row ──────────────────────────────────────
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
      currency,
    })
    step('subscription row upserted')
  }

  // ── DB Step 2: Activate team plan ───────────────────────────────────────────
  await billingRepo.activateTeamPlan(
    teamId,
    planId,
    periodStart ?? new Date(),
    periodEnd   ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  )
  step('team plan activated')

  // ── DB Step 3: Upsert invoice ───────────────────────────────────────────────
  if (totals) {
    await billingRepo.upsertInvoice(teamId, transactionId, {
      paddleCustomerId,
      amountDue:  amountPaidCents,
      amountPaid: amountPaidCents,
      currency,
      status: 'paid',
      periodStart,
      periodEnd,
      hostedInvoiceUrl: data.invoice_url ?? null,
      paidAt: new Date(),
    })
    step('invoice upserted')
  }

  // ── Cache Step 4: Invalidate plan cache ─────────────────────────────────────
  await invalidatePlanCache(teamId)
  step('plan cache invalidated')

  // ── Realtime Step 4b: Emit socket event to team room for real-time frontend update ──
  try {
    const { socketEmitter } = await import('../../realtime/socket.emitter')
    const { SERVER_EVENTS } = await import('../../realtime/socket.events')
    socketEmitter.to(`team:${teamId}`).emit(SERVER_EVENTS.BILLING_PLAN_UPDATED, {
      teamId,
      plan: planId,
      status: SubscriptionStatus.active,
      updatedAt: new Date().toISOString(),
    })
    step('realtime socket event emitted')
  } catch (err: any) {
    logger.warn({ err: err.message, teamId }, '[paddle.webhook] Failed to emit billing socket event')
  }

  // ── Queue Step 5: Enqueue confirmation email (dual-layer idempotency) ───────
  await enqueueBillingJob(
    'billing-confirmation',
    {
      type: 'BILLING_CONFIRMATION',
      teamId,
      planId,
      metadata: {
        amountPaid:      amountPaidCents ? `$${(amountPaidCents / 100).toFixed(2)}` : undefined,
        currency,
        billingInterval: interval,
        invoiceId:       transactionId,
        hostedInvoiceUrl: data.invoice_url ?? null,
        planId,
      },
    },
    // Deterministic jobId: same transaction can never produce two email jobs
    `billing-confirmation:${transactionId}`,
    { eventId, teamId, transactionId }
  )

  logger.info(
    { eventId, transactionId, teamId, planId, interval, amountPaidCents },
    '[paddle.webhook][transaction.completed] ✅ COMPLETE — subscription active, email queued'
  )
}

/**
 * subscription.created — Fired by Paddle after transaction.completed.
 * Used to capture trial state and ensure subscription row is fully populated.
 */
async function handleSubscriptionCreated(data: any, eventId: string): Promise<void> {
  const { teamId, planId: resolvedPlan, interval } = await resolveTeamAndPlan(data)
  const paddleSubscriptionId = data.id as string
  const paddleCustomerId     = (data.customerId || data.customer_id) as string
  const status               = mapPaddleSubscriptionStatus(data.status as string)

  if (!teamId) {
    logger.warn(
      { eventId, subscriptionId: paddleSubscriptionId },
      '[paddle.webhook][subscription.created] Cannot resolve teamId — skipping'
    )
    return
  }

  const planId               = resolvedPlan ?? PlanType.FREE
  const scheduledChange      = data.scheduledChange      || data.scheduled_change
  const currentBillingPeriod = data.currentBillingPeriod || data.current_billing_period
  const trialDates           = data.trialDates           || data.trial_dates
  const items                = data.items || []
  const price                = items?.[0]?.price
  const unitPrice            = price?.unitPrice           || price?.unit_price
  const currencyCode         = data.currencyCode         || data.currency_code

  const periodStart = currentBillingPeriod?.startsAt || currentBillingPeriod?.starts_at
    ? new Date(currentBillingPeriod.startsAt || currentBillingPeriod.starts_at)
    : undefined
  const periodEnd = currentBillingPeriod?.endsAt || currentBillingPeriod?.ends_at
    ? new Date(currentBillingPeriod.endsAt || currentBillingPeriod.ends_at)
    : undefined

  logger.info(
    { eventId, paddleSubscriptionId, teamId, planId, status },
    '[paddle.webhook][subscription.created] ▶ Upserting subscription row'
  )

  await billingRepo.upsertSubscription(teamId, {
    paddleSubscriptionId,
    paddleCustomerId,
    paddlePriceId: price?.id,
    plan:          planId,
    billingInterval: interval,
    status,
    currentPeriodStart: periodStart,
    currentPeriodEnd:   periodEnd,
    cancelAtPeriodEnd:  !!scheduledChange,
    trialStart: trialDates?.startsAt || trialDates?.starts_at ? new Date(trialDates.startsAt || trialDates.starts_at) : undefined,
    trialEnd:   trialDates?.endsAt   || trialDates?.ends_at   ? new Date(trialDates.endsAt   || trialDates.ends_at)   : undefined,
    unitAmount: unitPrice?.amount ? parseInt(unitPrice.amount) : undefined,
    currency:   currencyCode ?? 'usd',
  })

  if (status === SubscriptionStatus.active || status === SubscriptionStatus.trialing) {
    await billingRepo.updateTeamPlan(teamId, planId)
    await invalidatePlanCache(teamId)
  }

  // Trial started — queue trial notification (idempotent on subscriptionId)
  if (data.status === 'trialing') {
    await enqueueBillingJob(
      'trial-started',
      { type: 'TRIAL_STARTED', teamId, trialEndsAt: periodEnd },
      `trial-started:${paddleSubscriptionId}`,
      { eventId, teamId }
    )
  }

  logger.info(
    { eventId, paddleSubscriptionId, teamId, planId, status },
    '[paddle.webhook][subscription.created] ✅ Subscription row upserted & plan synced'
  )
}

/**
 * subscription.updated — Upgrades AND downgrades.
 */
async function handleSubscriptionUpdated(data: any, eventId: string): Promise<void> {
  const { teamId, planId: resolvedPlan, interval } = await resolveTeamAndPlan(data)
  const subscriptionId = data.id as string

  if (!teamId) {
    logger.warn(
      { eventId, subscriptionId },
      '[paddle.webhook][subscription.updated] Cannot resolve teamId — skipping'
    )
    return
  }

  const currentBillingPeriod = data.currentBillingPeriod || data.current_billing_period
  const scheduledChange      = data.scheduledChange      || data.scheduled_change
  const items                = data.items || []
  const price                = items?.[0]?.price
  const priceId              = price?.id as string | undefined
  const status               = mapPaddleSubscriptionStatus(data.status as string)
  const unitPrice            = price?.unitPrice || price?.unit_price
  const currencyCode         = data.currencyCode || data.currency_code
  const paddleCustomerId     = (data.customerId || data.customer_id) as string
  const newPlan              = resolvedPlan ?? PlanType.FREE

  logger.info(
    { eventId, subscriptionId, teamId, newPlan, status },
    '[paddle.webhook][subscription.updated] ▶ Updating subscription row'
  )

  await billingRepo.upsertSubscription(teamId, {
    paddleSubscriptionId: subscriptionId,
    paddleCustomerId,
    paddlePriceId: priceId,
    plan:          newPlan,
    billingInterval: interval,
    status,
    currentPeriodStart: currentBillingPeriod?.startsAt || currentBillingPeriod?.starts_at
      ? new Date(currentBillingPeriod.startsAt || currentBillingPeriod.starts_at)
      : undefined,
    currentPeriodEnd: currentBillingPeriod?.endsAt || currentBillingPeriod?.ends_at
      ? new Date(currentBillingPeriod.endsAt || currentBillingPeriod.ends_at)
      : undefined,
    cancelAtPeriodEnd: !!scheduledChange,
    unitAmount: unitPrice?.amount ? parseInt(unitPrice.amount) : undefined,
    currency:   currencyCode ?? 'usd',
  })

  if (newPlan) {
    await billingRepo.updateTeamPlan(teamId, newPlan)
    await invalidatePlanCache(teamId)

    await enqueueBillingJob(
      'subscription-upgraded',
      {
        type: 'SUBSCRIPTION_UPGRADED',
        teamId,
        planId: newPlan,
        metadata: {
          newPlanName:     newPlan,
          billingInterval: interval,
          amountPaid: unitPrice?.amount
            ? `$${(parseInt(unitPrice.amount) / 100).toFixed(2)}`
            : undefined,
        },
      },
      // subscriptionId is stable across updates; eventId makes it unique per-event
      `subscription-upgraded:${eventId}`,
      { eventId, teamId }
    )

    logger.info(
      { eventId, subscriptionId, teamId, newPlan, status },
      '[paddle.webhook][subscription.updated] ✅ Plan updated and upgrade email queued'
    )
  }
}

/**
 * subscription.canceled — Downgrade team to FREE.
 */
async function handleSubscriptionCanceled(data: any, eventId: string): Promise<void> {
  const { teamId } = await resolveTeamAndPlan(data)
  const subscriptionId = data.id as string

  if (!teamId) {
    logger.warn(
      { eventId, subscriptionId },
      '[paddle.webhook][subscription.canceled] Cannot resolve teamId — skipping'
    )
    return
  }

  const canceledAtRaw = data.canceledAt || data.canceled_at
  const cancelledAt   = canceledAtRaw ? new Date(canceledAtRaw) : new Date()

  logger.info(
    { eventId, subscriptionId, teamId, cancelledAt },
    '[paddle.webhook][subscription.canceled] ▶ Downgrading team to FREE'
  )

  try {
    await billingRepo.markSubscriptionCancelled(subscriptionId, cancelledAt)
  } catch (err: any) {
    logger.warn(
      { eventId, err: err.message, subscriptionId },
      '[paddle.webhook][subscription.canceled] Subscription row not found — skipping markCancelled (non-fatal)'
    )
  }

  await billingRepo.downgradeTeamToFree(teamId)
  await invalidatePlanCache(teamId)

  await enqueueBillingJob(
    'subscription-cancelled',
    { type: 'SUBSCRIPTION_CANCELLED', teamId, metadata: { cancelledAt: cancelledAt.toISOString() } },
    `subscription-cancelled:${eventId}`,
    { eventId, teamId }
  )

  logger.info(
    { eventId, subscriptionId, teamId },
    '[paddle.webhook][subscription.canceled] ✅ Team downgraded to FREE, cancellation email queued'
  )
}

/**
 * transaction.payment_failed — Failed payment handling.
 */
async function handleTransactionPaymentFailed(data: any, eventId: string): Promise<void> {
  const { teamId } = await resolveTeamAndPlan(data)
  const transactionId = data.id as string

  if (!teamId) {
    logger.warn(
      { eventId, transactionId },
      '[paddle.webhook][transaction.payment_failed] Cannot resolve teamId — skipping'
    )
    return
  }

  const totals       = data.details?.totals
  const currencyCode = (data.currencyCode || data.currency_code) ?? 'usd'
  const amountDueCents = totals?.total ? parseInt(totals.total) : 0

  logger.warn(
    { eventId, transactionId, teamId, amountDueCents, currencyCode },
    '[paddle.webhook][transaction.payment_failed] ▶ Payment failed — recording invoice and queuing alert'
  )

  if (totals) {
    await billingRepo.upsertInvoice(teamId, transactionId, {
      paddleCustomerId: (data.customerId || data.customer_id) as string,
      amountDue:  amountDueCents,
      amountPaid: 0,
      currency:   currencyCode,
      status:     'past_due',
    })
  }

  await enqueueBillingJob(
    'payment-failed',
    {
      type: 'PAYMENT_FAILED',
      teamId,
      transactionId,
      metadata: {
        amountDue: amountDueCents ? `$${(amountDueCents / 100).toFixed(2)}` : undefined,
        currency:  currencyCode,
      },
    },
    `payment-failed:${transactionId}`,
    { eventId, teamId, transactionId }
  )

  logger.warn(
    { eventId, transactionId, teamId, amountDueCents },
    '[paddle.webhook][transaction.payment_failed] ✅ Invoice recorded, payment failure alert queued'
  )
}
