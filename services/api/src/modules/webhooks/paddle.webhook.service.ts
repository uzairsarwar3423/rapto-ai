import { PlanType, SubscriptionStatus } from '@prisma/client'
import { logger } from '../../config/logger'
import { notifyQueue } from '../../queues/queue.client'
import { getPlanFromPriceId } from '../../config/plans.config'
import * as billingRepo from '../billing/billing.repository'
import { invalidatePlanCache } from '../../middleware/plan-limits.middleware'
import type { PaddleWebhookCustomData } from '../billing/billing.types'

export async function processEvent(event: any, eventId: string, eventType: string): Promise<void> {
  const data = event.data || event

  logger.info({ eventId, eventType }, '[paddle.webhook.service] ▶ Processing event')

  switch (eventType) {
    case 'transaction.completed':
      await handleTransactionCompleted(data, eventId)
      break
    case 'subscription.created':
      await handleSubscriptionCreated(data, eventId)
      break
    case 'subscription.updated':
      await handleSubscriptionUpdated(data, eventId)
      break
    case 'subscription.canceled':
      await handleSubscriptionCanceled(data, eventId)
      break
    case 'subscription.past_due':
      await handleSubscriptionPastDue(data, eventId)
      break
    case 'subscription.paused':
      await handleSubscriptionPaused(data, eventId)
      break
    case 'subscription.resumed':
      await handleSubscriptionResumed(data, eventId)
      break
    case 'adjustment.created':
    case 'adjustment.updated':
      await handleAdjustmentCreated(data, eventId)
      break
    case 'transaction.payment_failed':
      await handleTransactionPaymentFailed(data, eventId)
      break
    default:
      logger.info({ eventType, eventId }, '[paddle.webhook.service] Unhandled or informative event type — skipping')
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

  const items = data.items || []
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
    case 'unpaid':   return SubscriptionStatus.unpaid
    default:
      logger.warn({ paddleStatus }, '[paddle.webhook.service] Unknown Paddle subscription status — defaulting to active')
      return SubscriptionStatus.active
  }
}

function parseMinorAmount(amountRaw: any): number {
  if (amountRaw === null || amountRaw === undefined) return 0
  const num = Number(amountRaw)
  if (isNaN(num)) return 0
  return Math.round(num)
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
      `[paddle.webhook.service] ⚠️ Failed to enqueue ${jobName}`
    )
  }
}

async function handleTransactionCompleted(data: any, eventId: string): Promise<void> {
  const { teamId, planId, interval } = await resolveTeamAndPlan(data)

  if (!teamId || !planId) {
    logger.error(
      { transactionId: data.id, teamId, planId, customData: data.customData || data.custom_data },
      '[paddle.webhook.service][transaction.completed] ❌ Cannot resolve teamId or planId — ABORTING'
    )
    return
  }

  const paddleSubscriptionId = (data.subscriptionId || data.subscription_id) as string
  const paddleCustomerId     = (data.customerId || data.customer_id) as string
  const transactionId        = data.id as string

  const billingPeriod = data.billingPeriod || data.billing_period
  const periodStart = billingPeriod?.startsAt || billingPeriod?.starts_at
    ? new Date(billingPeriod.startsAt || billingPeriod.starts_at)
    : new Date()
  const periodEnd = billingPeriod?.endsAt || billingPeriod?.ends_at
    ? new Date(billingPeriod.endsAt || billingPeriod.ends_at)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  const totals = data.details?.totals
  const amountPaidCents = parseMinorAmount(totals?.total)
  const currency        = (data.currencyCode || data.currency_code) ?? 'usd'

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
    unitAmount: totals?.subtotal ? parseMinorAmount(totals.subtotal) : undefined,
    currency,
  } : null

  const invoiceData = totals ? {
    paddleTransactionId: transactionId,
    paddleCustomerId,
    amountDue:  amountPaidCents,
    amountPaid: amountPaidCents,
    amountRefunded: 0,
    currency,
    status: 'paid',
    periodStart,
    periodEnd,
    hostedInvoiceUrl: data.invoice_url ?? (data.hostedInvoiceUrl || null),
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

  await billingRepo.createBillingAuditLog({
    teamId,
    eventId,
    eventType: 'transaction.completed',
    action: 'ACTIVATE_SUBSCRIPTION',
    payload: { transactionId, planId, interval, amountPaidCents, currency },
  })

  await invalidatePlanCache(teamId)

  try {
    const { socketEmitter } = await import('../../realtime/socket.emitter')
    const { SERVER_EVENTS } = await import('../../realtime/socket.events')
    socketEmitter.to(`team:${teamId}`).emit(SERVER_EVENTS.BILLING_PLAN_UPDATED, {
      teamId,
      plan: planId,
      status: SubscriptionStatus.active,
      updatedAt: new Date().toISOString(),
    })
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
        hostedInvoiceUrl: data.invoice_url ?? (data.hostedInvoiceUrl || null),
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
    unitAmount: unitPrice?.amount ? parseMinorAmount(unitPrice.amount) : undefined,
    currency:   currencyCode ?? 'usd',
  }

  if (status === SubscriptionStatus.active || status === SubscriptionStatus.trialing) {
    await billingRepo.updateSubscriptionTransaction(teamId, planId, subData)
    await invalidatePlanCache(teamId)
  } else {
    await billingRepo.upsertSubscription(teamId, subData)
  }

  await billingRepo.createBillingAuditLog({
    teamId,
    eventId,
    eventType: 'subscription.created',
    action: 'SUBSCRIPTION_CREATED',
    payload: { paddleSubscriptionId, planId, status },
  })

  if (data.status === 'trialing') {
    await enqueueBillingJob(
      'trial-started',
      { type: 'TRIAL_STARTED', teamId, trialEndsAt: periodEnd },
      `trial-started:${paddleSubscriptionId}`,
      { eventId, teamId }
    )
  }
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
    unitAmount: unitPrice?.amount ? parseMinorAmount(unitPrice.amount) : undefined,
    currency:   currencyCode ?? 'usd',
  }

  if (status === SubscriptionStatus.active || status === SubscriptionStatus.trialing) {
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
            ? `$${(parseMinorAmount(unitPrice.amount) / 100).toFixed(2)}`
            : undefined,
        },
      },
      `subscription-upgraded:${eventId}`,
      { eventId, teamId }
    )
  } else {
    // For non-active states (past_due, paused, etc.), update subscription row but DO NOT escalate team plan
    await billingRepo.upsertSubscription(teamId, subData)
    await invalidatePlanCache(teamId)
  }

  await billingRepo.createBillingAuditLog({
    teamId,
    eventId,
    eventType: 'subscription.updated',
    action: 'SUBSCRIPTION_UPDATED',
    payload: { subscriptionId, newPlan, status },
  })
}

async function handleSubscriptionPastDue(data: any, eventId: string): Promise<void> {
  const { teamId } = await resolveTeamAndPlan(data)
  const subscriptionId = data.id as string

  if (!teamId) return

  const { prisma } = await import('../../db/client')
  // Mark grace period (7 days)
  const gracePeriodEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  await prisma.team.update({
    where: { id: teamId },
    data: { gracePeriodEnd },
  })

  await prisma.subscription.updateMany({
    where: { paddleSubscriptionId: subscriptionId },
    data: { status: SubscriptionStatus.past_due },
  })

  await billingRepo.createBillingAuditLog({
    teamId,
    eventId,
    eventType: 'subscription.past_due',
    action: 'SET_PAST_DUE_GRACE_PERIOD',
    payload: { subscriptionId, gracePeriodEnd },
  })

  await enqueueBillingJob(
    'payment-failed',
    {
      type: 'PAYMENT_FAILED',
      teamId,
      metadata: { subscriptionId, gracePeriodEnd: gracePeriodEnd.toISOString() },
    },
    `payment-past-due:${subscriptionId}:${Date.now()}`,
    { eventId, teamId }
  )
}

async function handleSubscriptionPaused(data: any, eventId: string): Promise<void> {
  const { teamId } = await resolveTeamAndPlan(data)
  const subscriptionId = data.id as string

  if (!teamId) return

  const { prisma } = await import('../../db/client')
  await prisma.subscription.updateMany({
    where: { paddleSubscriptionId: subscriptionId },
    data: { status: SubscriptionStatus.paused },
  })

  await billingRepo.downgradeTeamToFree(teamId)
  await invalidatePlanCache(teamId)

  await billingRepo.createBillingAuditLog({
    teamId,
    eventId,
    eventType: 'subscription.paused',
    action: 'SUBSCRIPTION_PAUSED',
    payload: { subscriptionId },
  })
}

async function handleSubscriptionResumed(data: any, eventId: string): Promise<void> {
  await handleSubscriptionUpdated(data, eventId)
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
  const currentBillingPeriod = data.currentBillingPeriod || data.current_billing_period
  const periodEnd = currentBillingPeriod?.endsAt || currentBillingPeriod?.ends_at
    ? new Date(currentBillingPeriod.endsAt || currentBillingPeriod.ends_at)
    : null

  const isImmediate = !periodEnd || periodEnd <= new Date()

  try {
    await billingRepo.markSubscriptionCancelled(subscriptionId, cancelledAt)
  } catch (err: any) {
    logger.warn(
      { eventId, err: err.message, subscriptionId },
      '[paddle.webhook.service][subscription.canceled] Subscription row not found — skipping markCancelled (non-fatal)'
    )
  }

  if (isImmediate) {
    await billingRepo.downgradeTeamToFree(teamId)
    await invalidatePlanCache(teamId)
  }

  await billingRepo.createBillingAuditLog({
    teamId,
    eventId,
    eventType: 'subscription.canceled',
    action: isImmediate ? 'CANCEL_IMMEDIATE' : 'SCHEDULE_CANCEL_PERIOD_END',
    payload: { subscriptionId, cancelledAt, periodEnd, isImmediate },
  })

  await enqueueBillingJob(
    'subscription-cancelled',
    { type: 'SUBSCRIPTION_CANCELLED', teamId, metadata: { cancelledAt: cancelledAt.toISOString() } },
    `subscription-cancelled:${eventId}`,
    { eventId, teamId }
  )

  logger.info(
    { eventId, subscriptionId, teamId, isImmediate },
    '[paddle.webhook.service][subscription.canceled] ✅ Subscription cancellation recorded'
  )
}

async function handleAdjustmentCreated(data: any, eventId: string): Promise<void> {
  const transactionId = (data.transactionId || data.transaction_id) as string
  const adjustmentId  = (data.id || data.adjustmentId) as string
  const amountRefunded = parseMinorAmount(data.totals?.total ?? data.amount)
  const currency       = (data.currencyCode || data.currency_code) ?? 'usd'
  const reason         = data.reason || 'customer_refund'
  const status         = data.status || 'completed'

  const { teamId } = await resolveTeamAndPlan(data)

  if (!teamId) {
    // Attempt lookup by invoice transaction
    const invoice = await billingRepo.findInvoiceByTransactionId(transactionId)
    if (!invoice) {
      logger.error({ transactionId, adjustmentId }, '[paddle.webhook.service] Refund adjustment received for unknown invoice')
      return
    }
    await processRefundForTeam(invoice.teamId, transactionId, adjustmentId, amountRefunded, currency, reason, status, eventId)
    return
  }

  await processRefundForTeam(teamId, transactionId, adjustmentId, amountRefunded, currency, reason, status, eventId)
}

async function processRefundForTeam(
  teamId: string,
  transactionId: string,
  adjustmentId: string,
  amountRefunded: number,
  currency: string,
  reason: string,
  status: string,
  eventId: string
): Promise<void> {
  const { isFullRefund } = await billingRepo.processRefundAdjustmentTransaction({
    teamId,
    paddleTransactionId: transactionId,
    paddleAdjustmentId: adjustmentId,
    amountRefunded,
    currency,
    reason,
    status,
  })

  await billingRepo.createBillingAuditLog({
    teamId,
    eventId,
    eventType: 'adjustment.created',
    action: isFullRefund ? 'FULL_REFUND_DOWNGRADE' : 'PARTIAL_REFUND',
    payload: { adjustmentId, transactionId, amountRefunded, currency, isFullRefund },
  })

  await invalidatePlanCache(teamId)

  logger.info(
    { teamId, transactionId, adjustmentId, amountRefunded, isFullRefund },
    '[paddle.webhook.service] ✅ Refund adjustment processed successfully'
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
  const amountDueCents = parseMinorAmount(totals?.total)

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

  await billingRepo.createBillingAuditLog({
    teamId,
    eventId,
    eventType: 'transaction.payment_failed',
    action: 'RECORD_PAYMENT_FAILURE',
    payload: { transactionId, amountDueCents, currencyCode },
  })

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
}
