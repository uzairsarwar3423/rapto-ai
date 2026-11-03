// ─────────────────────────────────────────────────────────────────────────────
// paddle.webhook.service.ts — Paddle event handlers (run by billing-webhook.worker from the durable inbox)
//
// Guarantees:
//   • Idempotent: every handler can run N times for the same event and converge on the same state
//     (inbox claim + unique keys + state-based repository functions).
//   • Order-safe: subscription.* events are compared with Subscription.lastEventOccurredAt; events for a
//     different Paddle subscription never overwrite a live one.
//   • Fail loud: anything that cannot be mapped throws — transient errors are retried, permanent ones are
//     surfaced as NEEDS_ATTENTION. Nothing is silently dropped.
//   • Team.plan is never taken from the payload; it is derived from the subscription via resolveEntitlement().
//
// Event policy (verified against Paddle docs):
//   transaction.completed  → payment captured AND processed → activation / renewal / invoice
//   transaction.paid       → IGNORED (completed always follows; handling both double-applied side effects)
//   transaction.billed     → IGNORED (invoice issued, NOT paid)
// ─────────────────────────────────────────────────────────────────────────────

import { PlanType, SubscriptionStatus } from '@prisma/client'
import { logger } from '../../config/logger'
import { notifyQueue } from '../../queues/queue.client'
import { prisma } from '../../db/client'
import { invalidatePlanCache } from '../../middleware/plan-limits.middleware'
import * as billingRepo from '../billing/billing.repository'
import type { ApplySubscriptionResult } from '../billing/billing.repository'
import type { UpsertSubscriptionData } from '../billing/billing.types'
import {
  UnresolvableEventError,
  extractSubscriptionData,
  mapPaddleSubscriptionStatus,
  parseMinorAmount,
  parsePaddleDate,
  resolvePlan,
  toSnake,
} from './paddle.mapper'

// Re-exported for existing importers / tests.
export { extractSubscriptionData, mapPaddleSubscriptionStatus, parseMinorAmount, parsePaddleDate, UnresolvableEventError }

export interface ProcessOutcome {
  status: 'PROCESSED' | 'IGNORED' | 'NEEDS_ATTENTION'
  teamId?: string | null
  note?: string
}

const IGNORED_EVENT_TYPES = new Set(['transaction.paid', 'transaction.billed'])

export async function processEvent(rawEvent: any, eventId: string, eventType: string): Promise<ProcessOutcome> {
  const event = toSnake<any>(rawEvent)
  const data = toSnake<any>(event.data ?? event)
  const occurredAt = parsePaddleDate(event.occurred_at) ?? null

  logger.info({ eventId, eventType }, '[paddle.webhook.service] ▶ Processing event')

  if (IGNORED_EVENT_TYPES.has(eventType)) {
    return { status: 'IGNORED', note: `${eventType} is intentionally not acted on` }
  }

  switch (eventType) {
    case 'transaction.completed':
      return handleTransactionCompleted(data, eventId)

    case 'subscription.created':
    case 'subscription.imported':
    case 'subscription.activated':
    case 'subscription.trialing':
    case 'subscription.updated':
    case 'subscription.resumed':
    case 'subscription.past_due':
    case 'subscription.paused':
    case 'subscription.canceled':
      return handleSubscriptionEvent(data, eventId, eventType, occurredAt)

    case 'adjustment.created':
    case 'adjustment.updated':
      return handleAdjustment(data, eventId, eventType)

    case 'transaction.payment_failed':
      return handleTransactionPaymentFailed(data, eventId)

    default:
      logger.info({ eventType, eventId }, '[paddle.webhook.service] Unhandled event type — recorded, no action')
      return { status: 'IGNORED', note: `unhandled event type ${eventType}` }
  }
}

// ── Team resolution (DB errors PROPAGATE so the event is retried, never dropped) ──

async function resolveTeamId(data: any): Promise<string> {
  const customTeamId: string | undefined = data.custom_data?.teamId ?? data.custom_data?.team_id
  const subscriptionId: string | undefined =
    data.subscription_id ?? (typeof data.id === 'string' && data.id.startsWith('sub_') ? data.id : undefined)
  const transactionId: string | undefined =
    data.transaction_id ?? (typeof data.id === 'string' && data.id.startsWith('txn_') ? data.id : undefined)
  const customerId: string | undefined = data.customer_id

  // 1. Our own record of this Paddle subscription is the strongest anchor.
  if (subscriptionId) {
    const sub = await prisma.subscription.findUnique({ where: { paddleSubscriptionId: subscriptionId }, select: { teamId: true } })
    if (sub) return sub.teamId
  }
  // 2. Invoice for this transaction.
  if (transactionId) {
    const inv = await prisma.invoice.findUnique({ where: { paddleTransactionId: transactionId }, select: { teamId: true } })
    if (inv) return inv.teamId
  }
  // 3. custom_data.teamId — set server-side when WE created the transaction (webhooks are signature-verified).
  if (customTeamId) {
    const team = await prisma.team.findUnique({ where: { id: customTeamId }, select: { id: true } })
    if (team) return team.id
    throw new UnresolvableEventError(`custom_data.teamId ${customTeamId} does not exist`)
  }
  // 4. Customer ID, only when it identifies exactly one team.
  if (customerId) {
    const teams = await prisma.team.findMany({ where: { paddleCustomerId: customerId }, select: { id: true }, take: 2 })
    if (teams.length === 1) return teams[0].id
    if (teams.length > 1) throw new UnresolvableEventError(`customer ${customerId} is shared by multiple teams`)
  }
  throw new UnresolvableEventError('Cannot resolve team for event')
}

// ── Side effects after a committed state change ──────────────────────────────

async function afterStateChange(teamId: string, result: ApplySubscriptionResult): Promise<void> {
  await invalidatePlanCache(teamId)
  try {
    const { socketEmitter } = await import('../../realtime/socket.emitter')
    const { SERVER_EVENTS } = await import('../../realtime/socket.events')
    socketEmitter.to(`team:${teamId}`).emit(SERVER_EVENTS.BILLING_PLAN_UPDATED, {
      teamId,
      plan: result.entitlement?.plan,
      reason: result.entitlement?.reason,
      updatedAt: new Date().toISOString(),
    })
  } catch (err: any) {
    logger.warn({ err: err.message, teamId }, '[paddle.webhook.service] socket emit failed (non-fatal)')
  }
}

/** Deterministic job IDs (BullMQ forbids ':' in custom IDs) ⇒ replays can never send a second email. Failure propagates ⇒ job retries. */
async function enqueueBillingJob(jobName: string, jobData: object, jobId: string): Promise<void> {
  await notifyQueue.add(jobName, jobData, { jobId })
}

/**
 * Turn the persistence result into an inbox outcome.
 *
 * subscription_mismatch means OUR stored subscription differs from the one in the event. The stored row may be stale
 * (e.g. an old trial Paddle already cancelled) — and then the event is the customer's NEW subscription that must be
 * adopted. Paddle, not our possibly-stale row, decides: reconcile, then classify.
 */
async function resolveOutcome(
  result: ApplySubscriptionResult,
  teamId: string,
  eventType: string,
  eventSubscriptionId: string | undefined,
  eventIsDead: boolean
): Promise<ProcessOutcome> {
  if (result.applied) return { status: 'PROCESSED', teamId }
  if (result.reason === 'stale_event') return { status: 'PROCESSED', teamId, note: 'stale event ignored (older than applied state)' }

  const { reconcileTeamFromPaddle } = await import('../billing/subscription-lifecycle.service')
  const r = await reconcileTeamFromPaddle(teamId)
  if (r.outcome === 'paddle_unavailable') {
    // Cannot decide without Paddle: retry later rather than guessing or dropping.
    throw new Error(`subscription mismatch for team ${teamId}: Paddle unavailable, will retry`)
  }
  await invalidatePlanCache(teamId)

  if (eventSubscriptionId && r.subscriptionId === eventSubscriptionId && r.synced) {
    return { status: 'PROCESSED', teamId, note: 'adopted via Paddle reconciliation (stored subscription was stale)' }
  }
  if (eventIsDead) {
    return { status: 'PROCESSED', teamId, note: 'event for a superseded subscription; the current subscription is unaffected' }
  }
  logger.error(
    { teamId, eventType, eventSubscriptionId, trackedSubscriptionId: r.subscriptionId, alert: 'billing.subscription_mismatch' },
    '[paddle.webhook.service] ALERT: a different LIVE Paddle subscription than the tracked one — not applied'
  )
  return { status: 'NEEDS_ATTENTION', teamId, note: 'event belongs to a different live Paddle subscription than the tracked one on this team' }
}

// ── transaction.completed ─────────────────────────────────────────────────────

async function handleTransactionCompleted(data: any, eventId: string): Promise<ProcessOutcome> {
  const transactionId = data.id as string
  const paddleSubscriptionId: string | undefined = data.subscription_id ?? undefined
  const paddleCustomerId: string = data.customer_id
  const teamId = await resolveTeamId(data)

  const totals = data.details?.totals
  const amountPaidCents = parseMinorAmount(totals?.total)
  const currency = String(data.currency_code ?? 'usd').toLowerCase()
  const billingPeriod = data.billing_period
  const periodStart = parsePaddleDate(billingPeriod?.starts_at)
  const periodEnd = parsePaddleDate(billingPeriod?.ends_at)

  const invoiceData = totals
    ? {
        paddleTransactionId: transactionId,
        paddleCustomerId,
        amountDue: amountPaidCents,
        amountPaid: amountPaidCents,
        amountRefunded: 0,
        currency,
        status: 'paid',
        periodStart,
        periodEnd,
        paidAt: parsePaddleDate(data.billed_at) ?? parsePaddleDate(data.updated_at) ?? undefined,
      }
    : null

  // A transaction that is not tied to a subscription grants no entitlement; just keep the receipt.
  if (!paddleSubscriptionId) {
    if (invoiceData) await billingRepo.upsertInvoice(teamId, transactionId, invoiceData)
    return { status: 'PROCESSED', teamId, note: 'transaction without subscription: invoice recorded only' }
  }

  const { planId, interval } = resolvePlan(data)

  // Used only when no subscription row exists yet (transaction processed before subscription.created).
  const trialConfig = data.items?.[0]?.price?.trial_period
  const inferredStatus =
    trialConfig || (amountPaidCents === 0 && planId !== PlanType.FREE)
      ? SubscriptionStatus.trialing
      : SubscriptionStatus.active
  const trialDays = trialConfig?.interval === 'day' ? Number(trialConfig.frequency) || 14 : 14
  const start = periodStart ?? new Date()

  const subData: UpsertSubscriptionData = {
    paddleSubscriptionId,
    paddleCustomerId,
    paddlePriceId: data.items?.[0]?.price?.id ?? data.items?.[0]?.price_id,
    plan: planId,
    billingInterval: interval,
    status: inferredStatus,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
    trialStart: inferredStatus === SubscriptionStatus.trialing ? start : undefined,
    trialEnd: inferredStatus === SubscriptionStatus.trialing ? (periodEnd ?? new Date(start.getTime() + trialDays * 86_400_000)) : undefined,
    unitAmount: data.items?.[0]?.price?.unit_price?.amount ? parseMinorAmount(data.items[0].price.unit_price.amount) : undefined,
    currency,
  }

  const result = await billingRepo.applySubscriptionState({
    teamId,
    data: subData,
    source: 'webhook_transaction',
    invoice: invoiceData,
    audit: {
      eventId,
      eventType: 'transaction.completed',
      action: 'TRANSACTION_COMPLETED',
      payload: { transactionId, planId, interval, amountPaidCents, currency },
    },
  })

  if (result.applied || result.reason === 'stale_event') await afterStateChange(teamId, result)

  if (result.applied && amountPaidCents > 0) {
    await enqueueBillingJob(
      'billing-confirmation',
      {
        type: 'BILLING_CONFIRMATION',
        teamId,
        planId,
        metadata: {
          amountPaid: `$${(amountPaidCents / 100).toFixed(2)}`,
          currency,
          billingInterval: interval,
          invoiceId: transactionId,
          planId,
        },
      },
      `billing-confirmation-${transactionId}`
    )
  }

  logger.info({ eventId, transactionId, teamId, planId, applied: result.applied, periodAdvanced: result.periodAdvanced }, '[paddle.webhook.service][transaction.completed] done')
  return resolveOutcome(result, teamId, 'transaction.completed', paddleSubscriptionId, false)
}

// ── subscription.* ────────────────────────────────────────────────────────────

async function handleSubscriptionEvent(
  data: any,
  eventId: string,
  eventType: string,
  occurredAt: Date | null
): Promise<ProcessOutcome> {
  const teamId = await resolveTeamId(data)
  const { planId, interval } = resolvePlan(data)
  const subData = extractSubscriptionData(data, planId, interval)

  // Grace is for customers who have actually paid before. A trial whose first charge fails never paid anything,
  // so it must not receive a 7-day premium window (REQUIRES BUSINESS CONFIRMATION — see audit report).
  let gracePeriodEnd: Date | undefined
  if (subData.status === SubscriptionStatus.past_due) {
    const everPaid = await prisma.invoice.count({ where: { teamId, amountPaid: { gt: 0 } }, take: 1 })
    if (everPaid === 0) gracePeriodEnd = new Date(0)
  }

  const result = await billingRepo.applySubscriptionState({
    teamId,
    data: subData,
    source: 'webhook_subscription',
    occurredAt,
    gracePeriodEnd,
    audit: {
      eventId,
      eventType,
      action: `SUBSCRIPTION_${eventType.split('.')[1].toUpperCase()}`,
      payload: {
        paddleSubscriptionId: subData.paddleSubscriptionId,
        plan: subData.plan,
        status: subData.status,
        trialStart: subData.trialStart,
        trialEnd: subData.trialEnd,
        currentPeriodEnd: subData.currentPeriodEnd,
        cancelAtPeriodEnd: subData.cancelAtPeriodEnd,
        effectivePlan: undefined,
      },
    },
  })

  if (result.applied) {
    await afterStateChange(teamId, result)

    const subId = subData.paddleSubscriptionId
    if (subData.status === SubscriptionStatus.trialing && (eventType === 'subscription.created' || eventType === 'subscription.trialing')) {
      await enqueueBillingJob(
        'trial-started',
        { type: 'TRIAL_STARTED', teamId, trialEndsAt: subData.trialEnd },
        `trial-started-${subId}`
      )
    }
    if (
      result.planChanged && result.previousPlan && result.previousPlan !== PlanType.FREE &&
      result.entitlement && result.entitlement.plan !== PlanType.FREE && eventType === 'subscription.updated'
    ) {
      await enqueueBillingJob(
        'subscription-upgraded',
        {
          type: 'SUBSCRIPTION_UPGRADED',
          teamId,
          planId: result.entitlement.plan,
          metadata: {
            newPlanName: result.entitlement.plan,
            billingInterval: interval,
            amountPaid: subData.unitAmount ? `$${(subData.unitAmount / 100).toFixed(2)}` : undefined,
          },
        },
        `subscription-upgraded-${eventId}`
      )
    }
    if (eventType === 'subscription.canceled') {
      await enqueueBillingJob(
        'subscription-cancelled',
        { type: 'SUBSCRIPTION_CANCELLED', teamId, metadata: { cancelledAt: (subData.cancelledAt ?? new Date()).toISOString() } },
        `subscription-cancelled-${eventId}`
      )
    }
    if (subData.status === SubscriptionStatus.past_due) {
      await enqueueBillingJob(
        'payment-failed',
        {
          type: 'PAYMENT_FAILED',
          teamId,
          metadata: { subscriptionId: subId, gracePeriodEnd: gracePeriodEnd && gracePeriodEnd.getTime() > 0 ? gracePeriodEnd.toISOString() : undefined },
        },
        `payment-failed-${subId}-${eventId}`
      )
    }
  }

  return resolveOutcome(result, teamId, eventType, subData.paddleSubscriptionId, subData.status === SubscriptionStatus.cancelled)
}

// ── adjustment.* (refunds, chargebacks, credits) ──────────────────────────────

async function handleAdjustment(data: any, eventId: string, eventType: string): Promise<ProcessOutcome> {
  const transactionId = data.transaction_id as string
  const adjustmentId = data.id as string
  const action = String(data.action ?? 'refund')
  const status = String(data.status ?? 'pending_approval')
  const currency = String(data.currency_code ?? 'usd').toLowerCase()
  const amount = parseMinorAmount(data.totals?.total ?? data.amount)

  // Owner of a refund is ALWAYS the team that owns the original invoice. Missing invoice ⇒ transaction.completed
  // has not been processed yet ⇒ throw so the event is retried instead of being lost.
  const invoice = await billingRepo.findInvoiceByTransactionId(transactionId)
  if (!invoice) throw new Error(`Adjustment ${adjustmentId}: invoice for ${transactionId} not recorded yet (will retry)`)
  const teamId = invoice.teamId

  const result = await billingRepo.processAdjustmentTransaction({
    teamId,
    paddleTransactionId: transactionId,
    paddleAdjustmentId: adjustmentId,
    action,
    status,
    amount,
    currency,
    reason: data.reason,
  })

  await billingRepo.createBillingAuditLog({
    teamId,
    eventId,
    eventType,
    action: result.entitlementRevoked ? 'REFUND_ACCESS_REVOKED' : `ADJUSTMENT_${action.toUpperCase()}_${status.toUpperCase()}`,
    payload: { adjustmentId, transactionId, action, status, amount, currency, totalRefunded: result.totalRefunded, isFullRefund: result.isFullRefund },
  })

  await invalidatePlanCache(teamId)

  if (result.needsReconcile) {
    // A previously revoked refund was rejected/reversed: let Paddle's state restore the subscription.
    const { reconcileTeamFromPaddle } = await import('../billing/subscription-lifecycle.service')
    await reconcileTeamFromPaddle(teamId).catch((err) =>
      logger.error({ err: err.message, teamId }, '[paddle.webhook.service] post-reversal reconcile failed')
    )
  }

  if ((action === 'chargeback' || action === 'chargeback_warning') && status !== 'rejected') {
    logger.error({ teamId, adjustmentId, action, status, alert: 'billing.dispute' }, '[paddle.webhook.service] ALERT: dispute / chargeback received')
    return { status: 'NEEDS_ATTENTION', teamId, note: `${action} (${status}) on ${transactionId}` }
  }
  return { status: 'PROCESSED', teamId }
}

// ── transaction.payment_failed ────────────────────────────────────────────────

async function handleTransactionPaymentFailed(data: any, eventId: string): Promise<ProcessOutcome> {
  const teamId = await resolveTeamId(data)
  const transactionId = data.id as string
  const currency = String(data.currency_code ?? 'usd').toLowerCase()
  const totals = data.details?.totals
  const amountDueCents = parseMinorAmount(totals?.total)

  if (totals) {
    await billingRepo.upsertInvoice(teamId, transactionId, {
      paddleCustomerId: data.customer_id,
      amountDue: amountDueCents,
      amountPaid: 0,
      currency,
      status: 'past_due',
    })
  }

  await billingRepo.createBillingAuditLog({
    teamId,
    eventId,
    eventType: 'transaction.payment_failed',
    action: 'RECORD_PAYMENT_FAILURE',
    payload: { transactionId, amountDueCents, currency },
  })

  await enqueueBillingJob(
    'payment-failed',
    {
      type: 'PAYMENT_FAILED',
      teamId,
      transactionId,
      metadata: { amountDue: amountDueCents ? `$${(amountDueCents / 100).toFixed(2)}` : undefined, currency },
    },
    `payment-failed-${transactionId}`
  )
  return { status: 'PROCESSED', teamId }
}

