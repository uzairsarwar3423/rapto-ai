import { PlanType, SubscriptionStatus } from '@prisma/client'
import { logger } from '../../config/logger'
import { notifyQueue } from '../../queues/queue.client'
import { getPlanFromPriceId, getPlanPriceCents } from '../../config/plans.config'
import * as billingRepo from '../billing/billing.repository'
import { invalidatePlanCache } from '../../middleware/plan-limits.middleware'
import type { PaddleWebhookCustomData, UpsertSubscriptionData } from '../billing/billing.types'

export async function processEvent(event: any, eventId: string, eventType: string): Promise<void> {
  const data = event.data || event

  logger.info({ eventId, eventType }, '[paddle.webhook.service] ▶ Processing event')

  switch (eventType) {
    case 'transaction.completed':
    case 'transaction.paid':
    case 'transaction.billed':
      await handleTransactionCompleted(data, eventId)
      break
    case 'subscription.created':
    case 'subscription.imported':
      await handleSubscriptionCreated(data, eventId)
      break
    case 'subscription.updated':
    case 'subscription.activated':
    case 'subscription.resumed':
      await handleSubscriptionUpdated(data, eventId)
      break
    case 'subscription.trialing':
      await handleSubscriptionTrialing(data, eventId)
      break
    case 'subscription.canceled':
    case 'subscription.cancelled':
      await handleSubscriptionCanceled(data, eventId)
      break
    case 'subscription.past_due':
      await handleSubscriptionPastDue(data, eventId)
      break
    case 'subscription.paused':
      await handleSubscriptionPaused(data, eventId)
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

export function parsePaddleDate(val: any): Date | undefined {
  if (!val) return undefined
  if (val instanceof Date) return isNaN(val.getTime()) ? undefined : val
  if (typeof val === 'number') {
    const ms = val < 1e11 ? val * 1000 : val
    const d = new Date(ms)
    return isNaN(d.getTime()) ? undefined : d
  }
  if (typeof val === 'string') {
    const trimmed = val.trim()
    if (!trimmed) return undefined
    const d = new Date(trimmed)
    return isNaN(d.getTime()) ? undefined : d
  }
  return undefined
}

export function mapPaddleSubscriptionStatus(paddleStatus: string): SubscriptionStatus {
  switch ((paddleStatus || '').toLowerCase()) {
    case 'active':             return SubscriptionStatus.active
    case 'trialing':          return SubscriptionStatus.trialing
    case 'past_due':          return SubscriptionStatus.past_due
    case 'paused':            return SubscriptionStatus.paused
    case 'canceled':
    case 'cancelled':         return SubscriptionStatus.cancelled
    case 'unpaid':            return SubscriptionStatus.unpaid
    case 'incomplete':        return SubscriptionStatus.incomplete
    case 'incomplete_expired':return SubscriptionStatus.incomplete_expired
    case 'refunded':          return SubscriptionStatus.refunded
    default:
      logger.warn({ paddleStatus }, '[paddle.webhook.service] Unknown Paddle subscription status — defaulting to active')
      return SubscriptionStatus.active
  }
}

export function parseMinorAmount(amountRaw: any): number {
  if (amountRaw === null || amountRaw === undefined) return 0
  const num = Number(amountRaw)
  if (isNaN(num)) return 0
  return Math.round(num)
}

export function extractSubscriptionData(
  data: any,
  resolvedPlan: PlanType | null,
  interval: 'month' | 'year'
): UpsertSubscriptionData {
  const paddleSubscriptionId = (data.id || data.subscriptionId || data.subscription_id) as string
  const paddleCustomerId     = (data.customerId || data.customer_id) as string
  const rawStatus            = (data.status as string) || 'active'
  const status               = mapPaddleSubscriptionStatus(rawStatus)
  const plan                 = resolvedPlan ?? PlanType.FREE

  const items = data.items || []
  const price = items?.[0]?.price
  const priceId = price?.id || (items?.[0] as any)?.price_id || data.details?.line_items?.[0]?.price_id || undefined

  const currentBillingPeriod = data.currentBillingPeriod || data.current_billing_period
  const billingPeriod = data.billingPeriod || data.billing_period
  const periodSource = currentBillingPeriod || billingPeriod

  let currentPeriodStart = parsePaddleDate(
    periodSource?.startsAt || periodSource?.starts_at || data.started_at || data.first_billed_at || data.created_at
  )
  let currentPeriodEnd = parsePaddleDate(
    periodSource?.endsAt || periodSource?.ends_at || data.next_billed_at
  )

  // Defensive Trial Dates Resolution
  const trialDates = data.trialDates || data.trial_dates || items?.[0]?.trial_dates || data.details?.line_items?.[0]?.trial_dates
  let trialStart = parsePaddleDate(trialDates?.startsAt || trialDates?.starts_at)
  let trialEnd = parsePaddleDate(trialDates?.endsAt || trialDates?.ends_at)

  if (status === SubscriptionStatus.trialing) {
    if (!trialStart) trialStart = currentPeriodStart || parsePaddleDate(data.started_at || data.created_at) || new Date()
    if (!trialEnd) trialEnd = currentPeriodEnd || parsePaddleDate(data.next_billed_at) || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    if (!currentPeriodStart && trialStart) currentPeriodStart = trialStart
    if (!currentPeriodEnd && trialEnd) currentPeriodEnd = trialEnd
  }

  // Defensive Unit Amount Resolution
  const unitPrice = price?.unitPrice || price?.unit_price
  let unitAmount: number | undefined = undefined

  if (unitPrice?.amount) {
    unitAmount = parseMinorAmount(unitPrice.amount)
  }
  if (unitAmount === undefined || unitAmount === 0) {
    const lineItemAmount = data.details?.line_items?.[0]?.unit_totals?.total || data.details?.line_items?.[0]?.price?.unit_price?.amount
    if (lineItemAmount) unitAmount = parseMinorAmount(lineItemAmount)
  }
  if (unitAmount === undefined || unitAmount === 0) {
    const recurringTotal = data.recurring_transaction_details?.totals?.subtotal || data.recurring_transaction_details?.totals?.total
    if (recurringTotal) unitAmount = parseMinorAmount(recurringTotal)
  }
  if (unitAmount === undefined || unitAmount === 0) {
    const rawTotal = data.details?.totals?.subtotal || data.details?.totals?.total
    if (rawTotal) unitAmount = parseMinorAmount(rawTotal)
  }
  if (unitAmount === undefined || unitAmount === 0) {
    unitAmount = getPlanPriceCents(plan, interval)
  }

  const currency = (
    data.currencyCode ||
    data.currency_code ||
    unitPrice?.currencyCode ||
    unitPrice?.currency_code ||
    'usd'
  ).toLowerCase()

  const scheduledChange = data.scheduledChange || data.scheduled_change
  const cancelAtPeriodEnd = Boolean(
    scheduledChange?.action === 'cancel' ||
    data.cancel_at_period_end ||
    data.cancelAtPeriodEnd
  )

  const canceledAt = parsePaddleDate(data.canceledAt || data.canceled_at)

  return {
    paddleSubscriptionId,
    paddleCustomerId,
    paddlePriceId: priceId,
    plan,
    billingInterval: interval,
    status,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    cancelledAt: canceledAt,
    trialStart,
    trialEnd,
    unitAmount,
    currency,
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

  const billingPeriod = data.billingPeriod || data.billing_period || data.currentBillingPeriod || data.current_billing_period
  const periodStart = parsePaddleDate(billingPeriod?.startsAt || billingPeriod?.starts_at) || new Date()
  const periodEnd   = parsePaddleDate(billingPeriod?.endsAt || billingPeriod?.ends_at) || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  const totals = data.details?.totals
  const amountPaidCents = parseMinorAmount(totals?.total)
  const currency        = (data.currencyCode || data.currency_code || 'usd').toLowerCase()

  logger.info(
    { eventId, transactionId, teamId, planId, interval, amountPaidCents, currency, paddleSubscriptionId },
    '[paddle.webhook.service][transaction.completed] ▶ Starting DB transaction'
  )

  const calculatedUnitAmount = totals?.subtotal
    ? parseMinorAmount(totals.subtotal)
    : (totals?.total ? parseMinorAmount(totals.total) : getPlanPriceCents(planId, interval))

  const items = data.items || []
  const paddlePriceId = items?.[0]?.price?.id || (items?.[0] as any)?.price_id || data.details?.line_items?.[0]?.price_id || undefined

  // Determine if this transaction is for a trialing subscription ($0 transaction or trialing origin)
  const isTrialTransaction = Boolean(data.trial_dates || data.trialDates || (amountPaidCents === 0 && data.status === 'trialing'))
  const status = isTrialTransaction ? SubscriptionStatus.trialing : SubscriptionStatus.active

  // Defensive Trial Dates Resolution
  const trialDates = data.trialDates || data.trial_dates || items?.[0]?.trial_dates
  let trialStart = parsePaddleDate(trialDates?.startsAt || trialDates?.starts_at)
  let trialEnd   = parsePaddleDate(trialDates?.endsAt || trialDates?.ends_at)
  if (status === SubscriptionStatus.trialing) {
    if (!trialStart) trialStart = periodStart
    if (!trialEnd) trialEnd = periodEnd
  }

  const subData: UpsertSubscriptionData | null = paddleSubscriptionId ? {
    paddleSubscriptionId,
    paddleCustomerId,
    paddlePriceId,
    plan: planId,
    billingInterval: interval,
    status,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
    trialStart,
    trialEnd,
    unitAmount: calculatedUnitAmount,
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
    payload: { transactionId, planId, interval, amountPaidCents, currency, status },
  })

  await invalidatePlanCache(teamId)

  try {
    const { socketEmitter } = await import('../../realtime/socket.emitter')
    const { SERVER_EVENTS } = await import('../../realtime/socket.events')
    socketEmitter.to(`team:${teamId}`).emit(SERVER_EVENTS.BILLING_PLAN_UPDATED, {
      teamId,
      plan: planId,
      status,
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
    '[paddle.webhook.service][transaction.completed] ✅ COMPLETE — subscription record synced, email queued'
  )
}

async function handleSubscriptionCreated(data: any, eventId: string): Promise<void> {
  const { teamId, planId: resolvedPlan, interval } = await resolveTeamAndPlan(data)
  const paddleSubscriptionId = (data.id || data.subscriptionId || data.subscription_id) as string

  if (!teamId) {
    logger.warn(
      { eventId, subscriptionId: paddleSubscriptionId },
      '[paddle.webhook.service][subscription.created] Cannot resolve teamId — skipping'
    )
    return
  }

  const subData = extractSubscriptionData(data, resolvedPlan, interval)

  if (subData.status === SubscriptionStatus.active || subData.status === SubscriptionStatus.trialing) {
    await billingRepo.updateSubscriptionTransaction(teamId, subData.plan, subData)
    await invalidatePlanCache(teamId)
  } else {
    await billingRepo.upsertSubscription(teamId, subData)
  }

  await billingRepo.createBillingAuditLog({
    teamId,
    eventId,
    eventType: 'subscription.created',
    action: 'SUBSCRIPTION_CREATED',
    payload: { paddleSubscriptionId, planId: subData.plan, status: subData.status, trialStart: subData.trialStart, trialEnd: subData.trialEnd, unitAmount: subData.unitAmount },
  })

  // Emit real-time socket event
  try {
    const { socketEmitter } = await import('../../realtime/socket.emitter')
    const { SERVER_EVENTS } = await import('../../realtime/socket.events')
    socketEmitter.to(`team:${teamId}`).emit(SERVER_EVENTS.BILLING_PLAN_UPDATED, {
      teamId,
      plan: subData.plan,
      status: subData.status,
      updatedAt: new Date().toISOString(),
    })
  } catch (err: any) {
    logger.warn({ err: err.message, teamId }, '[paddle.webhook.service] Failed to emit billing socket event')
  }

  if (subData.status === SubscriptionStatus.trialing) {
    await enqueueBillingJob(
      'trial-started',
      { type: 'TRIAL_STARTED', teamId, trialEndsAt: subData.trialEnd },
      `trial-started:${paddleSubscriptionId}`,
      { eventId, teamId }
    )
  }
}

async function handleSubscriptionTrialing(data: any, eventId: string): Promise<void> {
  await handleSubscriptionCreated(data, eventId)
}

async function handleSubscriptionUpdated(data: any, eventId: string): Promise<void> {
  const { teamId, planId: resolvedPlan, interval } = await resolveTeamAndPlan(data)
  const subscriptionId = (data.id || data.subscriptionId || data.subscription_id) as string

  if (!teamId) {
    logger.warn(
      { eventId, subscriptionId },
      '[paddle.webhook.service][subscription.updated] Cannot resolve teamId — skipping'
    )
    return
  }

  const subData = extractSubscriptionData(data, resolvedPlan, interval)

  if (subData.status === SubscriptionStatus.active || subData.status === SubscriptionStatus.trialing) {
    await billingRepo.updateSubscriptionTransaction(teamId, subData.plan, subData)
    await invalidatePlanCache(teamId)

    await enqueueBillingJob(
      'subscription-upgraded',
      {
        type: 'SUBSCRIPTION_UPGRADED',
        teamId,
        planId: subData.plan,
        metadata: {
          newPlanName:     subData.plan,
          billingInterval: interval,
          amountPaid: subData.unitAmount
            ? `$${(subData.unitAmount / 100).toFixed(2)}`
            : undefined,
        },
      },
      `subscription-upgraded:${eventId}`,
      { eventId, teamId }
    )
  } else {
    // For non-active states (past_due, paused, canceled), update subscription row & adjust team plan atomically
    await billingRepo.updateSubscriptionTransaction(teamId, subData.plan, subData)
    await invalidatePlanCache(teamId)
  }

  await billingRepo.createBillingAuditLog({
    teamId,
    eventId,
    eventType: 'subscription.updated',
    action: 'SUBSCRIPTION_UPDATED',
    payload: { subscriptionId, newPlan: subData.plan, status: subData.status, trialStart: subData.trialStart, trialEnd: subData.trialEnd, unitAmount: subData.unitAmount },
  })

  // Emit real-time socket event
  try {
    const { socketEmitter } = await import('../../realtime/socket.emitter')
    const { SERVER_EVENTS } = await import('../../realtime/socket.events')
    socketEmitter.to(`team:${teamId}`).emit(SERVER_EVENTS.BILLING_PLAN_UPDATED, {
      teamId,
      plan: subData.plan,
      status: subData.status,
      updatedAt: new Date().toISOString(),
    })
  } catch (err: any) {
    logger.warn({ err: err.message, teamId }, '[paddle.webhook.service] Failed to emit billing socket event')
  }
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
