// ─────────────────────────────────────────────────────────────────────────────
// billing.repository.ts — Data Layer (Prisma Queries Only)
//
// RULES:
//   ✅ Prisma queries only — zero Paddle SDK imports
//   ✅ Every state change to Subscription / Team.plan goes through applySubscriptionState(),
//      which (a) serializes per team with a transaction-scoped advisory lock, (b) discards stale and
//      foreign-subscription events, and (c) derives Team.plan from resolveEntitlement() — never from
//      the event payload — so Subscription and Team can never contradict each other.
//   ✅ Keyed on UNIQUE constraints (teamId, paddleSubscriptionId, paddleTransactionId, paddleAdjustmentId)
// ─────────────────────────────────────────────────────────────────────────────

import { PlanType, SubscriptionStatus, Prisma } from '@prisma/client'
import { prisma } from '../../db/client'
import { getPlanPriceCents } from '../../config/plans.config'
import { PAST_DUE_GRACE_DAYS, isLiveSubscriptionStatus, resolveEntitlement, type Entitlement } from './entitlement'
import type {
  UpsertSubscriptionData,
  UpsertInvoiceData,
  CreateBillingAuditLogData,
  PaginatedInvoices,
} from './billing.types'

type Tx = Prisma.TransactionClient

const DAY_MS = 24 * 60 * 60 * 1000

// ── Subscription reads ────────────────────────────────────────────────────────

export async function findSubscriptionByTeam(teamId: string) {
  return prisma.subscription.findUnique({
    where: { teamId },
    select: {
      plan: true,
      status: true,
      billingInterval: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      cancelledAt: true,
      trialStart: true,
      trialEnd: true,
      unitAmount: true,
      currency: true,
    },
  })
}

export async function findFullSubscriptionByTeam(teamId: string) {
  return prisma.subscription.findUnique({
    where: { teamId },
    select: {
      id: true,
      teamId: true,
      paddleSubscriptionId: true,
      paddleCustomerId: true,
      paddlePriceId: true,
      plan: true,
      status: true,
      billingInterval: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      cancelledAt: true,
      trialStart: true,
      trialEnd: true,
      unitAmount: true,
      currency: true,
      lastEventOccurredAt: true,
    },
  })
}

// ── Normalization ─────────────────────────────────────────────────────────────

/**
 * Fills ONLY what a trialing subscription cannot be stored without. Values reported by Paddle are never
 * overwritten; an amount is synthesized from list price only when no amount is known yet (first insert).
 */
function normalizeSubscriptionPayload(
  data: UpsertSubscriptionData,
  existingUnitAmount?: number | null
): UpsertSubscriptionData {
  let { trialStart, trialEnd, unitAmount, currentPeriodStart, currentPeriodEnd } = data
  const { status, plan, billingInterval } = data

  if (status === SubscriptionStatus.trialing) {
    if (!trialStart) trialStart = currentPeriodStart || new Date()
    if (!trialEnd) trialEnd = currentPeriodEnd || new Date(trialStart.getTime() + 14 * DAY_MS)
    if (!currentPeriodStart) currentPeriodStart = trialStart
    if (!currentPeriodEnd) currentPeriodEnd = trialEnd
  }

  if (unitAmount === undefined || unitAmount === null || unitAmount === 0) {
    unitAmount = existingUnitAmount && existingUnitAmount > 0
      ? existingUnitAmount
      : getPlanPriceCents(plan, (billingInterval || 'month') as 'month' | 'year')
  }

  return { ...data, trialStart, trialEnd, unitAmount, currentPeriodStart, currentPeriodEnd }
}

// ── Audit log ─────────────────────────────────────────────────────────────────

/**
 * Insert an immutable audit row. Duplicate eventId is silently skipped (SKIP DUPLICATES = ON CONFLICT DO NOTHING),
 * which — unlike catching P2002 — does NOT abort an enclosing Postgres transaction.
 */
export async function createBillingAuditLog(data: CreateBillingAuditLogData, tx?: Tx): Promise<void> {
  const client = tx ?? prisma
  await client.billingAuditLog.createMany({
    data: [{
      teamId: data.teamId,
      eventId: data.eventId,
      eventType: data.eventType,
      action: data.action,
      payload: (data.payload ?? {}) as Prisma.InputJsonValue,
    }],
    skipDuplicates: true,
  })
}

// ── Team lock ─────────────────────────────────────────────────────────────────

/** Transaction-scoped advisory lock: serializes every billing mutation for one team across all processes. */
async function lockTeamBilling(tx: Tx, teamId: string): Promise<void> {
  // pg_advisory_xact_lock returns void, which $queryRaw cannot deserialize — $executeRaw is the correct call.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'billing:' + teamId}))`
}

// ── Single writer of Team.plan ────────────────────────────────────────────────

/**
 * Recompute the effective plan from the subscription row and persist it on the team.
 * The only code that writes Team.plan for subscription-managed teams.
 */
async function syncTeamPlan(
  tx: Tx,
  teamId: string,
  now: Date
): Promise<{ entitlement: Entitlement; previousPlan: PlanType; changed: boolean }> {
  const team = await tx.team.findUniqueOrThrow({
    where: { id: teamId },
    select: { plan: true, gracePeriodEnd: true },
  })
  const subscription = await tx.subscription.findUnique({
    where: { teamId },
    select: { status: true, plan: true, trialEnd: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
  })
  const entitlement = resolveEntitlement(
    { teamPlan: team.plan, gracePeriodEnd: team.gracePeriodEnd, subscription },
    now
  )
  const changed = entitlement.plan !== team.plan
  if (changed) {
    await tx.team.update({
      where: { id: teamId },
      data: {
        plan: entitlement.plan,
        ...(entitlement.plan === PlanType.FREE ? { billingCycleEnd: null, gracePeriodEnd: null } : {}),
      },
    })
  }
  return { entitlement, previousPlan: team.plan, changed }
}

// ── The core mutation ─────────────────────────────────────────────────────────

export type ApplySource = 'webhook_subscription' | 'webhook_transaction' | 'sync' | 'checkout'

export interface ApplySubscriptionParams {
  teamId: string
  data: UpsertSubscriptionData
  source: ApplySource
  /** Paddle occurred_at of the event; drives the stale-event guard for webhook_subscription. */
  occurredAt?: Date | null
  invoice?: (UpsertInvoiceData & { paddleTransactionId: string }) | null
  /** Explicit grace end for past_due (set by the handler). */
  gracePeriodEnd?: Date | null
  audit?: { eventId?: string; eventType: string; action: string; payload?: any }
  now?: Date
}

export interface ApplySubscriptionResult {
  applied: boolean
  reason?: 'stale_event' | 'subscription_mismatch'
  entitlement?: Entitlement
  previousPlan?: PlanType
  planChanged: boolean
  periodAdvanced: boolean
}

/**
 * Apply a subscription state (from a webhook, a Paddle API read, or a local plan change) atomically.
 *
 *  • stale_event            — older than the newest subscription event already applied → ignored
 *  • subscription_mismatch  — a DIFFERENT Paddle subscription while the stored one is still live → NOT overwritten
 *                             (prevents orphaning a billing relationship); caller must flag for operator review
 *  • quota reset            — only when a NEW billing period starts (period start strictly advances)
 */
export async function applySubscriptionState(params: ApplySubscriptionParams): Promise<ApplySubscriptionResult> {
  const { teamId, source, occurredAt, invoice, audit } = params
  const now = params.now ?? new Date()

  return prisma.$transaction(async (tx) => {
    await lockTeamBilling(tx, teamId)

    const team = await tx.team.findUniqueOrThrow({
      where: { id: teamId },
      select: { plan: true, billingCycleStart: true, billingCycleEnd: true, gracePeriodEnd: true },
    })
    const existing = await tx.subscription.findUnique({ where: { teamId } })

    let data = normalizeSubscriptionPayload(params.data, existing?.unitAmount)
    const sameSubscription = existing?.paddleSubscriptionId === data.paddleSubscriptionId

    // ── Guards ──
    if (existing && sameSubscription) {
      if (
        source === 'webhook_subscription' && occurredAt && existing.lastEventOccurredAt &&
        occurredAt.getTime() < existing.lastEventOccurredAt.getTime()
      ) {
        // Invoice side-effects are still safe to record; subscription state is not touched.
        if (invoice) await upsertInvoiceTx(tx, teamId, invoice)
        return { applied: false, reason: 'stale_event', planChanged: false, periodAdvanced: false }
      }
    } else if (
      existing && !sameSubscription &&
      // A different Paddle subscription may replace the stored one ONLY when the stored one is dead and the incoming one is live.
      (isLiveSubscriptionStatus(existing.status) || !isLiveSubscriptionStatus(data.status))
    ) {
      return { applied: false, reason: 'subscription_mismatch', planChanged: false, periodAdvanced: false }
    }

    // ── Transaction-sourced events must not rewrite lifecycle state owned by subscription.* events ──
    if (source === 'webhook_transaction' && existing && sameSubscription) {
      const advancesPeriod =
        data.currentPeriodEnd && (!existing.currentPeriodEnd || data.currentPeriodEnd > existing.currentPeriodEnd)
      data = {
        ...data,
        plan: existing.plan,
        billingInterval: existing.billingInterval ?? data.billingInterval,
        status: existing.status === SubscriptionStatus.past_due ? SubscriptionStatus.active : existing.status,
        cancelAtPeriodEnd: existing.cancelAtPeriodEnd,
        cancelledAt: existing.cancelledAt ?? undefined,
        trialStart: existing.trialStart ?? undefined,
        trialEnd: existing.trialEnd ?? undefined,
        unitAmount: existing.unitAmount ?? data.unitAmount,
        currentPeriodStart: advancesPeriod ? data.currentPeriodStart : existing.currentPeriodStart ?? undefined,
        currentPeriodEnd: advancesPeriod ? data.currentPeriodEnd : existing.currentPeriodEnd ?? undefined,
      }
    }

    // Preserve history when a dead subscription is replaced by a new one.
    if (existing && !sameSubscription) {
      await createBillingAuditLog({
        teamId,
        eventType: 'subscription.replaced',
        action: 'SUBSCRIPTION_REPLACED',
        payload: {
          previous: {
            paddleSubscriptionId: existing.paddleSubscriptionId,
            status: existing.status,
            plan: existing.plan,
            currentPeriodEnd: existing.currentPeriodEnd,
            cancelledAt: existing.cancelledAt,
          },
          next: { paddleSubscriptionId: data.paddleSubscriptionId, status: data.status, plan: data.plan },
        },
      }, tx)
    }

    const newLastEvent =
      source === 'webhook_subscription' && occurredAt
        ? (existing?.lastEventOccurredAt && existing.lastEventOccurredAt > occurredAt ? existing.lastEventOccurredAt : occurredAt)
        : existing?.lastEventOccurredAt ?? undefined

    const row = {
      paddleSubscriptionId: data.paddleSubscriptionId,
      paddleCustomerId: data.paddleCustomerId,
      paddlePriceId: data.paddlePriceId ?? existing?.paddlePriceId ?? null,
      plan: data.plan,
      billingInterval: data.billingInterval,
      status: data.status,
      currentPeriodStart: data.currentPeriodStart ?? existing?.currentPeriodStart ?? null,
      currentPeriodEnd: data.currentPeriodEnd ?? existing?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
      cancelledAt: data.cancelledAt ?? (data.status === SubscriptionStatus.cancelled ? existing?.cancelledAt ?? now : null),
      trialStart: data.trialStart ?? existing?.trialStart ?? null,
      trialEnd: data.trialEnd ?? existing?.trialEnd ?? null,
      unitAmount: data.unitAmount ?? existing?.unitAmount ?? null,
      currency: data.currency ?? existing?.currency ?? 'usd',
      lastEventOccurredAt: newLastEvent ?? null,
    }

    await tx.subscription.upsert({
      where: { teamId },
      create: { teamId, ...row },
      update: row,
    })

    // ── Grace period policy ──
    let gracePeriodEnd: Date | null = team.gracePeriodEnd
    if (data.status === SubscriptionStatus.active || data.status === SubscriptionStatus.trialing) {
      gracePeriodEnd = null
    } else if (data.status === SubscriptionStatus.past_due) {
      gracePeriodEnd = params.gracePeriodEnd !== undefined
        ? params.gracePeriodEnd
        : team.gracePeriodEnd && team.gracePeriodEnd > now
          ? team.gracePeriodEnd                       // never extend an already-running grace window
          : new Date(now.getTime() + PAST_DUE_GRACE_DAYS * DAY_MS)
    }

    // ── Effective plan (single source of truth) ──
    const entitlement = resolveEntitlement(
      {
        teamPlan: team.plan,
        gracePeriodEnd,
        subscription: {
          status: row.status,
          plan: row.plan,
          trialEnd: row.trialEnd,
          currentPeriodEnd: row.currentPeriodEnd,
          cancelAtPeriodEnd: row.cancelAtPeriodEnd,
        },
      },
      now
    )

    // New billing period ⇒ reset quota. Replays / syncs / plan changes inside the same period do NOT.
    const newStart = row.currentPeriodStart
    const periodAdvanced = Boolean(
      entitlement.plan !== PlanType.FREE && newStart && (!team.billingCycleStart || newStart > team.billingCycleStart)
    )

    await tx.team.update({
      where: { id: teamId },
      data: {
        plan: entitlement.plan,
        gracePeriodEnd: entitlement.plan === PlanType.FREE ? null : gracePeriodEnd,
        ...(entitlement.plan === PlanType.FREE
          ? { billingCycleEnd: null }
          : periodAdvanced
            ? { meetingsUsed: 0, billingCycleStart: newStart, billingCycleEnd: row.currentPeriodEnd }
            : {}),
      },
    })

    if (invoice) await upsertInvoiceTx(tx, teamId, invoice)
    if (audit) await createBillingAuditLog({ teamId, ...audit }, tx)

    return {
      applied: true,
      entitlement,
      previousPlan: team.plan,
      planChanged: entitlement.plan !== team.plan,
      periodAdvanced,
    }
  }, { timeout: 15_000 })
}

async function upsertInvoiceTx(
  tx: Tx,
  teamId: string,
  invoice: UpsertInvoiceData & { paddleTransactionId: string }
): Promise<void> {
  await tx.invoice.upsert({
    where: { paddleTransactionId: invoice.paddleTransactionId },
    create: { teamId, ...invoice, amountRefunded: invoice.amountRefunded ?? 0 },
    // paidAt / amountRefunded are intentionally NOT overwritten on replay.
    update: {
      amountPaid: invoice.amountPaid,
      status: invoice.status,
      ...(invoice.hostedInvoiceUrl ? { hostedInvoiceUrl: invoice.hostedInvoiceUrl } : {}),
    },
  })
}

// ── Time-driven expiry (cron / read-repair) ───────────────────────────────────

export interface ExpiryResult {
  teamId: string
  transitioned: 'trial_expired' | 'cancel_period_ended' | 'plan_resynced' | 'none'
  from: PlanType
  to: PlanType
}

/**
 * Bring one team's persisted state in line with its entitlement at `now`.
 * Idempotent and concurrency-safe: serialized by the team advisory lock, and each status transition is a
 * conditional UPDATE (… WHERE status = 'trialing' AND "trialEnd" <= now), so a second run, a racing webhook
 * that already converted the trial to `active`, or a paid subscription are all no-ops.
 */
export async function expireTeamEntitlement(teamId: string, now: Date = new Date()): Promise<ExpiryResult> {
  return prisma.$transaction(async (tx) => {
    await lockTeamBilling(tx, teamId)

    const before = await tx.team.findUnique({ where: { id: teamId }, select: { plan: true } })
    if (!before) return { teamId, transitioned: 'none', from: PlanType.FREE, to: PlanType.FREE }

    let transitioned: ExpiryResult['transitioned'] = 'none'

    const trial = await tx.subscription.updateMany({
      where: { teamId, status: SubscriptionStatus.trialing, trialEnd: { lte: now } },
      data: { status: SubscriptionStatus.cancelled, cancelAtPeriodEnd: false, cancelledAt: now },
    })
    if (trial.count > 0) transitioned = 'trial_expired'

    const cancelled = await tx.subscription.updateMany({
      where: { teamId, status: SubscriptionStatus.active, cancelAtPeriodEnd: true, currentPeriodEnd: { lte: now } },
      data: { status: SubscriptionStatus.cancelled, cancelAtPeriodEnd: false, cancelledAt: now },
    })
    if (cancelled.count > 0) transitioned = 'cancel_period_ended'

    const { entitlement, changed } = await syncTeamPlan(tx, teamId, now)
    if (transitioned === 'none' && changed) transitioned = 'plan_resynced'

    if (transitioned !== 'none') {
      await createBillingAuditLog({
        teamId,
        eventType: 'system.entitlement_expiry',
        action: transitioned === 'trial_expired' ? 'TRIAL_EXPIRED' : transitioned === 'cancel_period_ended' ? 'CANCEL_PERIOD_ENDED' : 'PLAN_RESYNCED',
        payload: { from: before.plan, to: entitlement.plan, reason: entitlement.reason, at: now.toISOString() },
      }, tx)
    }

    return { teamId, transitioned, from: before.plan, to: entitlement.plan }
  }, { timeout: 15_000 })
}

/**
 * Candidate teams whose persisted state may disagree with their entitlement right now.
 * Bounded by `take`; the caller loops. Uses indexes (status, trialEnd) / (cancelAtPeriodEnd, currentPeriodEnd) / gracePeriodEnd.
 */
export async function findTeamsNeedingExpiry(now: Date, take = 200): Promise<string[]> {
  const [trials, cancels, grace, notEntitled] = await Promise.all([
    prisma.subscription.findMany({
      where: { status: SubscriptionStatus.trialing, trialEnd: { lte: now } },
      select: { teamId: true }, take,
    }),
    prisma.subscription.findMany({
      where: { status: SubscriptionStatus.active, cancelAtPeriodEnd: true, currentPeriodEnd: { lte: now } },
      select: { teamId: true }, take,
    }),
    prisma.team.findMany({
      where: { gracePeriodEnd: { lte: now }, plan: { not: PlanType.FREE } },
      select: { id: true }, take,
    }),
    // Paid plan on the team while the subscription is in a non-entitled state (paused / refunded / cancelled …).
    prisma.team.findMany({
      where: {
        plan: { not: PlanType.FREE },
        subscription: {
          status: {
            in: [
              SubscriptionStatus.cancelled, SubscriptionStatus.paused, SubscriptionStatus.refunded,
              SubscriptionStatus.unpaid, SubscriptionStatus.incomplete, SubscriptionStatus.incomplete_expired,
            ],
          },
        },
      },
      select: { id: true }, take,
    }),
  ])
  return [...new Set([
    ...trials.map((s) => s.teamId),
    ...cancels.map((s) => s.teamId),
    ...grace.map((t) => t.id),
    ...notEntitled.map((t) => t.id),
  ])]
}

// ── Invoices ──────────────────────────────────────────────────────────────────

/** Upsert an invoice record. Keyed on UNIQUE paddleTransactionId — safe to replay. */
export async function upsertInvoice(
  teamId: string,
  paddleTransactionId: string,
  data: UpsertInvoiceData
): Promise<void> {
  await prisma.invoice.upsert({
    where: { paddleTransactionId },
    create: {
      teamId,
      paddleTransactionId,
      paddleCustomerId: data.paddleCustomerId,
      amountDue: data.amountDue,
      amountPaid: data.amountPaid,
      amountRefunded: data.amountRefunded ?? 0,
      currency: data.currency,
      status: data.status,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      hostedInvoiceUrl: data.hostedInvoiceUrl,
      paidAt: data.paidAt,
    },
    // A failure event must never downgrade an invoice that was already paid (out-of-order safety).
    update: data.status === 'paid'
      ? { amountPaid: data.amountPaid, status: data.status, ...(data.hostedInvoiceUrl ? { hostedInvoiceUrl: data.hostedInvoiceUrl } : {}) }
      : {},
  })
}

export async function findInvoiceByTransactionId(paddleTransactionId: string) {
  return prisma.invoice.findUnique({ where: { paddleTransactionId } })
}

export async function findInvoicesByTeam(
  teamId: string,
  cursor: string | null,
  limit: number
): Promise<PaginatedInvoices> {
  const invoices = await prisma.invoice.findMany({
    where: { teamId },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      amountDue: true,
      amountPaid: true,
      amountRefunded: true,
      currency: true,
      status: true,
      hostedInvoiceUrl: true,
      paidAt: true,
      createdAt: true,
    },
  })

  const hasMore = invoices.length > limit
  const page = hasMore ? invoices.slice(0, limit) : invoices
  const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null
  return { invoices: page, nextCursor }
}

// ── Refunds / chargebacks ─────────────────────────────────────────────────────

const MONEY_OUT_ACTIONS = ['refund', 'chargeback']

export interface AdjustmentParams {
  teamId: string
  paddleTransactionId: string
  paddleAdjustmentId: string
  action: string
  status: string
  amount: number
  currency: string
  reason?: string
}

export interface AdjustmentResult {
  totalRefunded: number
  isFullRefund: boolean
  entitlementRevoked: boolean
  /** Money-out was reversed / rejected after we had revoked access: operator or reconciliation must restore it. */
  needsReconcile: boolean
}

/**
 * Idempotent, state-based adjustment processing.
 * invoice.amountRefunded is DERIVED from the approved adjustment rows (never incremented), so created→updated,
 * redelivery, rejection and reversal all converge on the same value.
 * Access is revoked only when an APPROVED refund/chargeback fully covers the team's most recent paid invoice.
 */
export async function processAdjustmentTransaction(params: AdjustmentParams): Promise<AdjustmentResult> {
  const { teamId, paddleTransactionId, paddleAdjustmentId, action, status, amount, currency, reason } = params

  return prisma.$transaction(async (tx) => {
    await lockTeamBilling(tx, teamId)

    const invoice = await tx.invoice.findUnique({ where: { paddleTransactionId } })
    if (!invoice) throw new Error(`Invoice not found for transaction: ${paddleTransactionId}`)

    await tx.refund.upsert({
      where: { paddleAdjustmentId },
      create: { teamId, invoiceId: invoice.id, paddleAdjustmentId, amount, currency, reason: reason ?? 'customer_refund', action, status },
      update: { amount, action, status },
    })

    const agg = await tx.refund.aggregate({
      where: { invoiceId: invoice.id, status: 'approved', action: { in: MONEY_OUT_ACTIONS } },
      _sum: { amount: true },
    })
    const totalRefunded = agg._sum.amount ?? 0
    const isFullRefund = invoice.amountPaid > 0 && totalRefunded >= invoice.amountPaid

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        amountRefunded: totalRefunded,
        status: isFullRefund ? 'refunded' : invoice.status === 'refunded' ? 'paid' : invoice.status,
      },
    })

    let entitlementRevoked = false
    let needsReconcile = false

    if (isFullRefund) {
      const latestPaid = await tx.invoice.findFirst({
        where: { teamId, amountPaid: { gt: 0 } },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
      if (latestPaid?.id === invoice.id) {
        await tx.subscription.updateMany({ where: { teamId }, data: { status: SubscriptionStatus.refunded } })
        const synced = await syncTeamPlan(tx, teamId, new Date())
        entitlementRevoked = synced.changed
      }
    } else {
      const sub = await tx.subscription.findUnique({ where: { teamId }, select: { status: true } })
      needsReconcile = sub?.status === SubscriptionStatus.refunded
    }

    return { totalRefunded, isFullRefund, entitlementRevoked, needsReconcile }
  }, { timeout: 15_000 })
}

// ── Team billing reads ────────────────────────────────────────────────────────

export async function getTeamForUsage(teamId: string) {
  return prisma.team.findUnique({
    where: { id: teamId },
    select: {
      plan: true,
      meetingsUsed: true,
      billingCycleEnd: true,
      _count: { select: { members: { where: { deletedAt: null } } } },
    },
  })
}
