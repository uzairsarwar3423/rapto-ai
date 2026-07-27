// ─────────────────────────────────────────────────────────────────────────────
// paddle.webhook.ts — Paddle Webhook Handler (6 Real Events)
//
// SECURITY DISCIPLINE (non-negotiable):
//   1. Raw body MUST be used for signature verification (never parsed body)
//   2. timingSafeEqual — NEVER === for signature comparison
//   3. Timestamp tolerance enforced (5 minutes) — replay attack prevention
//   4. teamId resolved from custom_data with DB customer fallback — the trust anchor
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
import { getPlanFromPriceId } from '../../config/plans.config'
import * as billingRepo from '../billing/billing.repository'
import { invalidatePlanCache } from '../../middleware/plan-limits.middleware'
import type { PaddleWebhookCustomData } from '../billing/billing.types'

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
    }, '[paddle.webhook] Debugging webhook unmarshal variables')

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
      logger.error({ err, eventId, eventType }, '[paddle.webhook] Error processing event asynchronously')
    }
  })
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Resilient resolution of teamId & planId from customData or fallback to DB/priceId.
 */
async function resolveTeamAndPlan(data: any): Promise<{
  teamId: string | null
  planId: PlanType | null
  interval: 'month' | 'year'
}> {
  const customData = (data.customData || data.custom_data) as PaddleWebhookCustomData | undefined

  // 1. Resolve Team ID
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
        logger.info({ paddleCustomerId, teamId }, '[paddle.webhook] Resolved teamId from paddleCustomerId fallback')
      }
    } catch (err) {
      logger.error({ err, paddleCustomerId }, '[paddle.webhook] Failed to resolve teamId from DB')
    }
  }

  // 2. Resolve Plan ID
  let planId: PlanType | null = null
  const customPlan = customData?.planId as PlanType | undefined
  if (customPlan && Object.values(PlanType).includes(customPlan)) {
    planId = customPlan
  }

  // Fallback: Resolve planId from items/priceId
  const items = data.items || []
  const priceId = items?.[0]?.price?.id || items?.[0]?.price_id || data.details?.line_items?.[0]?.price_id
  const priceMatch = priceId ? getPlanFromPriceId(priceId) : undefined

  if (!planId && priceMatch) {
    planId = priceMatch.planId
    logger.info({ priceId, planId }, '[paddle.webhook] Resolved planId from priceId lookup fallback')
  }

  const interval = priceMatch?.interval ?? (customData?.interval ?? 'month')

  return { teamId, planId, interval }
}

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

// ── Event Handlers ─────────────────────────────────────────────────────────────

/**
 * transaction.completed — Fires on first checkout + every renewal
 */
async function handleTransactionCompleted(data: any): Promise<void> {
  const { teamId, planId, interval } = await resolveTeamAndPlan(data)

  if (!teamId || !planId) {
    logger.error(
      { transactionId: data.id, teamId, planId, keys: Object.keys(data) },
      '[paddle.webhook] transaction.completed: missing teamId or planId — SKIPPING'
    )
    return
  }

  const paddleSubscriptionId = (data.subscriptionId || data.subscription_id) as string
  const paddleCustomerId     = (data.customerId || data.customer_id) as string
  const transactionId        = data.id as string

  // Resolve billing period
  const billingPeriod = data.billingPeriod || data.billing_period
  const periodStart = billingPeriod?.startsAt || billingPeriod?.starts_at ? new Date(billingPeriod.startsAt || billingPeriod.starts_at) : undefined
  const periodEnd   = billingPeriod?.endsAt || billingPeriod?.ends_at   ? new Date(billingPeriod.endsAt || billingPeriod.ends_at)   : undefined

  // 1. Upsert subscription row
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

  // 4. Invalidate all plan & team detail caches
  await invalidatePlanCache(teamId)

  // 5. Queue confirmation email
  await notifyQueue.add('billing-confirmation', {
    type: 'BILLING_CONFIRMATION',
    teamId,
    planId,
    metadata: {
      amountPaid: totals?.total ? `$${(parseInt(totals.total) / 100).toFixed(2)}` : undefined,
      invoiceId: transactionId,
      hostedInvoiceUrl: data.payments?.[0]?.method_details?.card ? null : (data.invoice_url ?? null),
      planId,
    },
  })

  logger.info({ teamId, planId, transactionId }, '[paddle.webhook] transaction.completed — team plan activated successfully')
}

/**
 * subscription.created — Captures period fields after transaction.completed
 */
async function handleSubscriptionCreated(data: any): Promise<void> {
  const { teamId, planId: resolvedPlan, interval } = await resolveTeamAndPlan(data)
  const paddleSubscriptionId = data.id as string
  const paddleCustomerId = (data.customerId || data.customer_id) as string
  const status = mapPaddleSubscriptionStatus(data.status as string)

  if (!teamId) {
    logger.warn({ subscriptionId: paddleSubscriptionId }, '[paddle.webhook] subscription.created: unable to resolve teamId')
    return
  }

  const planId = resolvedPlan ?? PlanType.FREE
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

  // Ensure active subscriptions activate team plan in Postgres
  if (status === SubscriptionStatus.active || status === SubscriptionStatus.trialing) {
    await billingRepo.updateTeamPlan(teamId, planId)
    await invalidatePlanCache(teamId)
  }

  logger.info({ teamId, planId, status }, '[paddle.webhook] subscription.created — subscription row upserted & plan synced')
}

/**
 * subscription.updated — Upgrades AND downgrades
 */
async function handleSubscriptionUpdated(data: any): Promise<void> {
  const { teamId, planId: resolvedPlan, interval } = await resolveTeamAndPlan(data)
  const subscriptionId = data.id as string

  if (!teamId) {
    logger.warn({ subscriptionId }, '[paddle.webhook] subscription.updated: unable to resolve teamId')
    return
  }

  const currentBillingPeriod = data.currentBillingPeriod || data.current_billing_period
  const scheduledChange = data.scheduledChange || data.scheduled_change

  const items = data.items || []
  const price = items?.[0]?.price
  const priceId = price?.id as string | undefined
  const status = mapPaddleSubscriptionStatus(data.status as string)
  
  const unitPrice = price?.unitPrice || price?.unit_price
  const currencyCode = data.currencyCode || data.currency_code
  const paddleCustomerId = (data.customerId || data.customer_id) as string

  const newPlan = resolvedPlan ?? PlanType.FREE

  // Update subscription row
  await billingRepo.upsertSubscription(teamId, {
    paddleSubscriptionId: subscriptionId,
    paddleCustomerId,
    paddlePriceId: priceId,
    plan: newPlan,
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

    await notifyQueue.add('subscription-upgraded', {
      type: 'SUBSCRIPTION_UPGRADED',
      teamId,
      planId: newPlan,
      metadata: {
        newPlanName: newPlan,
        billingInterval: interval,
        amountPaid: unitPrice?.amount ? `$${(parseInt(unitPrice.amount) / 100).toFixed(2)}` : undefined,
      },
    })
    logger.info({ teamId, newPlan, status }, '[paddle.webhook] subscription.updated — team plan updated successfully')
  }
}

/**
 * subscription.canceled — Downgrade team to FREE
 */
async function handleSubscriptionCanceled(data: any): Promise<void> {
  const { teamId } = await resolveTeamAndPlan(data)
  const subscriptionId = data.id as string

  if (!teamId) {
    logger.warn({ subscriptionId }, '[paddle.webhook] subscription.canceled: unable to resolve teamId')
    return
  }

  const canceledAtRaw = data.canceledAt || data.canceled_at
  const cancelledAt = canceledAtRaw ? new Date(canceledAtRaw) : new Date()

  try {
    await billingRepo.markSubscriptionCancelled(subscriptionId, cancelledAt)
  } catch (err) {
    logger.warn({ err, subscriptionId }, '[paddle.webhook] subscription.canceled: subscription row not found — skipping markCancelled')
  }

  // Downgrade team to FREE
  await billingRepo.downgradeTeamToFree(teamId)
  await invalidatePlanCache(teamId)

  await notifyQueue.add('subscription-cancelled', {
    type: 'SUBSCRIPTION_CANCELLED',
    teamId,
  })

  logger.info({ teamId, subscriptionId }, '[paddle.webhook] subscription.canceled — team downgraded to FREE, history preserved')
}

/**
 * transaction.payment_failed — Payment failure handling
 */
async function handleTransactionPaymentFailed(data: any): Promise<void> {
  const { teamId } = await resolveTeamAndPlan(data)
  const transactionId = data.id as string

  if (!teamId) {
    logger.warn({ transactionId }, '[paddle.webhook] transaction.payment_failed: unable to resolve teamId')
    return
  }

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

  await notifyQueue.add('payment-failed', {
    type: 'PAYMENT_FAILED',
    teamId,
    transactionId,
    metadata: {
      amountDue: totals?.total ? `$${(parseInt(totals.total) / 100).toFixed(2)}` : undefined,
    },
  })

  logger.warn({ teamId, transactionId }, '[paddle.webhook] transaction.payment_failed — invoice updated, notification queued')
}
