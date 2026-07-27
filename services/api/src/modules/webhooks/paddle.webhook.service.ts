import { PlanType, SubscriptionStatus } from '@prisma/client'
import { logger } from '../../config/logger'
import { notifyQueue } from '../../queues/queue.client'
import { getPlanFromPriceId } from '../../config/plans.config'
import * as billingRepo from '../billing/billing.repository'
import { invalidatePlanCache } from '../../middleware/plan-limits.middleware'
import type { PaddleWebhookCustomData } from '../billing/billing.types'

export async function processEvent(event: any, eventId: string, eventType: string): Promise<void> {
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
      logger.debug({ eventType, eventId }, '[paddle.webhook.service] Unhandled event type — skipping')
  }
}

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
          '[paddle.webhook.service] resolveTeamAndPlan: teamId resolved via paddleCustomerId DB fallback'
        )
      } else {
        logger.warn(
          { paddleCustomerId },
          '[paddle.webhook.service] resolveTeamAndPlan: paddleCustomerId not found in DB — teamId unresolvable'
        )
      }
    } catch (err: any) {
      logger.error(
        { err: err.message, paddleCustomerId },
        '[paddle.webhook.service] resolveTeamAndPlan: DB lookup failed'
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
      '[paddle.webhook.service] resolveTeamAndPlan: planId resolved via priceId lookup fallback'
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
      logger.warn({ paddleStatus }, '[paddle.webhook.service] Unknown Paddle subscription status — defaulting to ACTIVE')
      return SubscriptionStatus.active
  }
}

async function enqueueBillingJob(
  jobName: string,
  jobData: object,
  jobId: string,
  context: { eventId: string; teamId: string; transactionId?: string }
): Promise<void> {
  try {
    await notifyQueue.add(jobName, jobData, { jobId })
    logger.info(
      { jobName, jobId, ...context },
      `[paddle.webhook.service] ✅ Billing job enqueued: ${jobName}`
    )
  } catch (queueErr: any) {
    logger.error(
      { err: queueErr.message, jobName, jobId, jobData, ...context },
      `[paddle.webhook.service] ⚠️ CRITICAL: failed to enqueue ${jobName} — manual replay required`
    )
  }
}

async function handleTransactionCompleted(data: any, eventId: string): Promise<void> {
  const step = (s: string) => logger.info({ eventId, step: s }, `[paddle.webhook.service][transaction.completed] ${s}`)

  const { teamId, planId, interval } = await resolveTeamAndPlan(data)
  step('team+plan resolved')

  if (!teamId || !planId) {
    logger.error(
      { transactionId: data.id, teamId, planId, customData: data.customData || data.custom_data },
      '[paddle.webhook.service][transaction.completed] ❌ Cannot resolve teamId or planId — ABORTING. Check custom_data at checkout.'
    )
    return
  }

  const paddleSubscriptionId = (data.subscriptionId || data.subscription_id) as string
  const paddleCustomerId     = (data.customerId || data.customer_id) as string
  const transactionId        = data.id as string

  const billingPeriod = data.billingPeriod || data.billing_period
  const periodStart   = billingPeriod?.startsAt || billingPeriod?.starts_at
    ? new Date(billingPeriod.startsAt || billingPeriod.starts_at)
    : new Date()
  const periodEnd = billingPeriod?.endsAt || billingPeriod?.ends_at
    ? new Date(billingPeriod.endsAt || billingPeriod.ends_at)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  const totals = data.details?.totals
  const amountPaidCents = totals?.total ? parseInt(totals.total) : 0
  const currency        = data.currency_code ?? 'usd'

  logger.info(
    { eventId, transactionId, teamId, planId, interval, amountPaidCents, currency, paddleSubscriptionId },
    '[paddle.webhook.service][transaction.completed] ▶ Starting DB transaction'
  )

  const subData = paddleSubscriptionId ? {
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
  } : null

  const invoiceData = totals ? {
    paddleTransactionId: transactionId,
    paddleCustomerId,
    amountDue:  amountPaidCents,
    amountPaid: amountPaidCents,
    currency,
    status: 'paid',
    periodStart,
    periodEnd,
    hostedInvoiceUrl: data.invoice_url ?? null,
    paidAt: new Date(),
  } : null

  await billingRepo.activateSubscriptionTransaction(
    teamId,
    planId,
    subData,
    invoiceData,
    periodStart,
    periodEnd
  )
  step('transaction committed')

  await invalidatePlanCache(teamId)
  step('plan cache invalidated')

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
    logger.warn({ err: err.message, teamId }, '[paddle.webhook.service] Failed to emit billing socket event')
  }

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
    `billing-confirmation:${transactionId}`,
    { eventId, teamId, transactionId }
  )

  logger.info(
    { eventId, transactionId, teamId, planId, interval, amountPaidCents },
    '[paddle.webhook.service][transaction.completed] ✅ COMPLETE — subscription active, email queued'
  )
}

async function handleSubscriptionCreated(data: any, eventId: string): Promise<void> {
  const { teamId, planId: resolvedPlan, interval } = await resolveTeamAndPlan(data)
  const paddleSubscriptionId = data.id as string
  const paddleCustomerId     = (data.customerId || data.customer_id) as string
  const status               = mapPaddleSubscriptionStatus(data.status as string)

  if (!teamId) {
    logger.warn(
      { eventId, subscriptionId: paddleSubscriptionId },
      '[paddle.webhook.service][subscription.created] Cannot resolve teamId — skipping'
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
    '[paddle.webhook.service][subscription.created] ▶ Upserting subscription row (Transaction)'
  )

  const subData = {
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
  }

  if (status === SubscriptionStatus.active || status === SubscriptionStatus.trialing) {
    await billingRepo.updateSubscriptionTransaction(teamId, planId, subData)
    await invalidatePlanCache(teamId)
  } else {
    await billingRepo.upsertSubscription(teamId, subData)
  }

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
    '[paddle.webhook.service][subscription.created] ✅ Subscription row upserted & plan synced'
  )
}

async function handleSubscriptionUpdated(data: any, eventId: string): Promise<void> {
  const { teamId, planId: resolvedPlan, interval } = await resolveTeamAndPlan(data)
  const subscriptionId = data.id as string

  if (!teamId) {
    logger.warn(
      { eventId, subscriptionId },
      '[paddle.webhook.service][subscription.updated] Cannot resolve teamId — skipping'
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
    '[paddle.webhook.service][subscription.updated] ▶ Updating subscription row (Transaction)'
  )

  const subData = {
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
  }

  if (newPlan) {
    await billingRepo.updateSubscriptionTransaction(teamId, newPlan, subData)
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
      `subscription-upgraded:${eventId}`,
      { eventId, teamId }
    )

    logger.info(
      { eventId, subscriptionId, teamId, newPlan, status },
      '[paddle.webhook.service][subscription.updated] ✅ Plan updated and upgrade email queued'
    )
  }
}

async function handleSubscriptionCanceled(data: any, eventId: string): Promise<void> {
  const { teamId } = await resolveTeamAndPlan(data)
  const subscriptionId = data.id as string

  if (!teamId) {
    logger.warn(
      { eventId, subscriptionId },
      '[paddle.webhook.service][subscription.canceled] Cannot resolve teamId — skipping'
    )
    return
  }

  const canceledAtRaw = data.canceledAt || data.canceled_at
  const cancelledAt   = canceledAtRaw ? new Date(canceledAtRaw) : new Date()

  logger.info(
    { eventId, subscriptionId, teamId, cancelledAt },
    '[paddle.webhook.service][subscription.canceled] ▶ Downgrading team to FREE'
  )

  try {
    await billingRepo.markSubscriptionCancelled(subscriptionId, cancelledAt)
  } catch (err: any) {
    logger.warn(
      { eventId, err: err.message, subscriptionId },
      '[paddle.webhook.service][subscription.canceled] Subscription row not found — skipping markCancelled (non-fatal)'
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
    '[paddle.webhook.service][subscription.canceled] ✅ Team downgraded to FREE, cancellation email queued'
  )
}

async function handleTransactionPaymentFailed(data: any, eventId: string): Promise<void> {
  const { teamId } = await resolveTeamAndPlan(data)
  const transactionId = data.id as string

  if (!teamId) {
    logger.warn(
      { eventId, transactionId },
      '[paddle.webhook.service][transaction.payment_failed] Cannot resolve teamId — skipping'
    )
    return
  }

  const totals       = data.details?.totals
  const currencyCode = (data.currencyCode || data.currency_code) ?? 'usd'
  const amountDueCents = totals?.total ? parseInt(totals.total) : 0

  logger.warn(
    { eventId, transactionId, teamId, amountDueCents, currencyCode },
    '[paddle.webhook.service][transaction.payment_failed] ▶ Payment failed — recording invoice and queuing alert'
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
    '[paddle.webhook.service][transaction.payment_failed] ✅ Invoice recorded, payment failure alert queued'
  )
}
