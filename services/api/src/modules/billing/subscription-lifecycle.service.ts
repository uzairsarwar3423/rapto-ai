// ─────────────────────────────────────────────────────────────────────────────
// subscription-lifecycle.service.ts — time-driven & self-healing billing operations
//
//   runEntitlementSync()  every 5 min  — trial expiry, scheduled-cancel end, grace end, inbox redrive
//   runReconciliation()   hourly       — compare DB with Paddle for suspicious subscriptions and heal
//   reconcileTeamFromPaddle(teamId)    — Paddle is the source of truth for ONE team (also behind /billing/sync)
//
// Why not rely on Paddle webhooks for trial end?  A webhook is delivered at-least-once, possibly late, possibly
// never (outage, misconfiguration). The effective plan is therefore ALSO computed from server timestamps at read
// time (entitlement.ts) and persisted here by a cron that is idempotent, retry-safe and lock-protected.
// ─────────────────────────────────────────────────────────────────────────────

import { PlanType, SubscriptionStatus } from '@prisma/client'
import { prisma } from '../../db/client'
import { redis } from '../../config/redis'
import { logger } from '../../config/logger'
import { invalidatePlanCache } from '../../middleware/plan-limits.middleware'
import { billingWebhookQueue } from '../../queues/queue.client'
import * as billingRepo from './billing.repository'
import { isLiveSubscriptionStatus } from './entitlement'
import { getTeamEntitlement } from './entitlement.service'
import { countInboxByStatus, findRedrivableEvents } from '../webhooks/paddle.inbox.repository'
import { processInboxEvent } from '../webhooks/paddle.event-processor'
import { withTimeout } from '../../utils/with-timeout'
import { entityToSnake, extractSubscriptionData, resolvePlan } from '../webhooks/paddle.mapper'

const PADDLE_CALL_TIMEOUT_MS = 8_000
const LIVE_PADDLE_STATUSES = ['active', 'trialing', 'past_due', 'paused'] as const

/** Cross-replica cron mutex (DB guards remain the correctness layer; this only avoids duplicated Paddle calls). */
async function withCronLock<T>(name: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T | null> {
  const key = `lock:cron:${name}`
  let acquired: string | null = 'OK'
  try {
    acquired = await redis.set(key, String(Date.now()), 'EX', ttlSeconds, 'NX')
  } catch (err: any) {
    logger.warn({ err: err.message, name }, '[lifecycle] cron lock unavailable — continuing (DB guards keep this safe)')
  }
  if (!acquired) {
    logger.info({ name }, '[lifecycle] another instance holds the cron lock — skipping this run')
    return null
  }
  try {
    return await fn()
  } finally {
    await redis.del(key).catch(() => undefined)
  }
}

// ── Reconcile one team against Paddle ─────────────────────────────────────────

export interface ReconcileResult {
  synced: boolean
  plan: PlanType
  status?: SubscriptionStatus
  anomalies: string[]
}

export async function reconcileTeamFromPaddle(teamId: string): Promise<ReconcileResult> {
  const anomalies: string[] = []
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true, paddleCustomerId: true } })
  const stored = await billingRepo.findFullSubscriptionByTeam(teamId)

  if (!team || (!team.paddleCustomerId && !stored)) {
    const ent = await getTeamEntitlement(teamId)
    return { synced: false, plan: ent.plan, anomalies }
  }

  const { paddle } = await import('../../services/paddle.client')
  const customerId = stored?.paddleCustomerId ?? team.paddleCustomerId!

  let snapshot: any | null = null

  // 1. The subscription we already track: authoritative read by ID.
  if (stored) {
    try {
      snapshot = entityToSnake(await withTimeout(paddle.subscriptions.get(stored.paddleSubscriptionId), PADDLE_CALL_TIMEOUT_MS, 'paddle.subscriptions.get'))
    } catch (err: any) {
      if (err?.code !== 'not_found') {
        logger.error({ err: err.message, teamId }, '[lifecycle] Paddle read failed — keeping local state')
        const ent = await getTeamEntitlement(teamId)
        return { synced: false, plan: ent.plan, status: stored.status, anomalies: ['paddle_unavailable'] }
      }
      anomalies.push('stored_subscription_not_found_in_paddle')
    }
  }

  // 2. Any other live subscription for this customer (covers "no stored sub" and duplicate-subscription detection).
  let liveOthers: any[] = []
  try {
    const page = await withTimeout(
      paddle.subscriptions.list({ customerId: [customerId], status: [...LIVE_PADDLE_STATUSES] as any }).next(),
      PADDLE_CALL_TIMEOUT_MS,
      'paddle.subscriptions.list'
    )
    liveOthers = (page ?? []).map((s: any) => entityToSnake(s)).filter((s: any) => s.id !== stored?.paddleSubscriptionId)
  } catch (err: any) {
    logger.warn({ err: err.message, teamId }, '[lifecycle] Paddle list failed — duplicate detection skipped')
  }

  if (!snapshot && liveOthers.length > 0) {
    snapshot = liveOthers.shift()
  }
  if (liveOthers.length > 0) {
    anomalies.push(`additional_live_paddle_subscriptions:${liveOthers.map((s) => s.id).join(',')}`)
    logger.error({ teamId, ids: liveOthers.map((s) => s.id), alert: 'billing.duplicate_subscription' }, '[lifecycle] ALERT: customer has more than one live Paddle subscription')
  }

  if (!snapshot) {
    const ent = await getTeamEntitlement(teamId)
    return { synced: false, plan: ent.plan, status: stored?.status, anomalies }
  }

  try {
    const { planId, interval } = resolvePlan(snapshot)
    const data = extractSubscriptionData(snapshot, planId, interval)
    const result = await billingRepo.applySubscriptionState({
      teamId,
      data,
      source: 'sync',
      audit: { eventType: 'system.reconcile', action: 'RECONCILED_FROM_PADDLE', payload: { paddleSubscriptionId: data.paddleSubscriptionId, status: data.status, anomalies } },
    })
    if (!result.applied) anomalies.push(result.reason ?? 'not_applied')
    await invalidatePlanCache(teamId)
    const ent = await getTeamEntitlement(teamId)
    return { synced: result.applied, plan: ent.plan, status: data.status, anomalies }
  } catch (err: any) {
    logger.error({ err: err.message, teamId, alert: 'billing.reconcile_failed' }, '[lifecycle] could not map Paddle subscription')
    const ent = await getTeamEntitlement(teamId)
    return { synced: false, plan: ent.plan, anomalies: [...anomalies, `unmappable:${err.message}`] }
  }
}

// ── Entitlement sync (trial expiry etc.) ──────────────────────────────────────

export interface EntitlementSyncSummary {
  examined: number
  trialsExpired: number
  cancellationsEnded: number
  plansResynced: number
  errors: number
  redriven: number
}

async function notifyPlanChange(teamId: string, plan: PlanType, reason: string): Promise<void> {
  await invalidatePlanCache(teamId)
  try {
    const { socketEmitter } = await import('../../realtime/socket.emitter')
    const { SERVER_EVENTS } = await import('../../realtime/socket.events')
    socketEmitter.to(`team:${teamId}`).emit(SERVER_EVENTS.BILLING_PLAN_UPDATED, { teamId, plan, reason, updatedAt: new Date().toISOString() })
  } catch (err: any) {
    logger.warn({ err: err.message, teamId }, '[lifecycle] socket emit failed (non-fatal)')
  }
}

export async function runEntitlementSync(now: Date = new Date()): Promise<EntitlementSyncSummary> {
  const summary: EntitlementSyncSummary = { examined: 0, trialsExpired: 0, cancellationsEnded: 0, plansResynced: 0, errors: 0, redriven: 0 }

  const teamIds = await billingRepo.findTeamsNeedingExpiry(now)
  summary.examined = teamIds.length

  for (const teamId of teamIds) {
    try {
      // For an expired trial, Paddle may already have converted it to a paid subscription whose webhook is late.
      // Ask first so a paying customer is never downgraded by this job; fall back to local expiry if Paddle is unreachable.
      const sub = await billingRepo.findFullSubscriptionByTeam(teamId)
      if (sub?.status === SubscriptionStatus.trialing && sub.trialEnd && sub.trialEnd <= now) {
        await reconcileTeamFromPaddle(teamId).catch((err) =>
          logger.warn({ err: err.message, teamId }, '[lifecycle] pre-expiry Paddle check failed — expiring on local clock')
        )
      }

      const res = await billingRepo.expireTeamEntitlement(teamId, now)
      if (res.transitioned !== 'none') {
        if (res.transitioned === 'trial_expired') summary.trialsExpired++
        else if (res.transitioned === 'cancel_period_ended') summary.cancellationsEnded++
        else summary.plansResynced++
        logger.info({ ...res }, '[lifecycle] entitlement transitioned')
        await notifyPlanChange(teamId, res.to, res.transitioned)
      }
    } catch (err: any) {
      summary.errors++
      logger.error({ err: err.message, teamId, alert: 'billing.entitlement_sync_failed' }, '[lifecycle] entitlement sync failed for team — will retry next run')
    }
  }

  summary.redriven = await redriveInboxEvents(now).catch((err) => {
    logger.error({ err: err.message }, '[lifecycle] inbox redrive failed')
    return 0
  })

  logger.info(summary, '[lifecycle] entitlement sync complete')
  return summary
}

export function runEntitlementSyncCron(): Promise<EntitlementSyncSummary | null> {
  return withCronLock('entitlement-sync', 240, () => runEntitlementSync())
}

// ── Inbox redrive & backlog alerting ──────────────────────────────────────────

export async function redriveInboxEvents(now: Date = new Date()): Promise<number> {
  const due = await findRedrivableEvents(now)
  let n = 0
  for (const e of due) {
    try {
      await billingWebhookQueue.add(
        'process-paddle-event',
        { eventId: e.eventId, eventType: e.eventType, receivedAt: now.toISOString() },
        { jobId: `paddle-evt-${e.eventId}-r${e.attempts}` } // unique per attempt: a retained failed job must not swallow the redrive
      )
    } catch (queueErr: any) {
      // Queue unavailable: process in-process. Safe — claim is atomic.
      logger.warn({ err: queueErr.message, eventId: e.eventId }, '[lifecycle] queue unavailable — processing event inline')
      await processInboxEvent(e.eventId).catch((err) => logger.error({ err: err.message, eventId: e.eventId }, '[lifecycle] inline processing failed'))
    }
    n++
  }

  const counts = await countInboxByStatus()
  if ((counts.FAILED ?? 0) > 0 || (counts.NEEDS_ATTENTION ?? 0) > 0) {
    logger.error({ counts, alert: 'billing.inbox_backlog' }, '[lifecycle] ALERT: webhook events need attention (FAILED / NEEDS_ATTENTION)')
  }
  return n
}

// ── Reconciliation ────────────────────────────────────────────────────────────

export async function runReconciliation(now: Date = new Date(), limit = 100): Promise<{ checked: number; healed: number; anomalies: number }> {
  const staleLiveBefore = new Date(now.getTime() - 60 * 60 * 1000)
  const recentlyEndedAfter = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)

  const candidates = await prisma.subscription.findMany({
    where: {
      OR: [
        // Live but the period should already have been renewed ⇒ a renewal webhook was probably missed.
        { status: { in: [SubscriptionStatus.active, SubscriptionStatus.trialing, SubscriptionStatus.past_due, SubscriptionStatus.paused] }, currentPeriodEnd: { lt: staleLiveBefore } },
        // Recently ended locally (e.g. trial expired on the local clock) ⇒ confirm Paddle agrees.
        { status: { in: [SubscriptionStatus.cancelled, SubscriptionStatus.refunded] }, updatedAt: { gt: recentlyEndedAfter } },
      ],
    },
    orderBy: { updatedAt: 'asc' },
    take: limit,
    select: { teamId: true },
  })

  let healed = 0
  let anomalies = 0
  for (const c of candidates) {
    try {
      const before = await getTeamEntitlement(c.teamId)
      const r = await reconcileTeamFromPaddle(c.teamId)
      if (r.anomalies.length) anomalies++
      if (r.synced && r.plan !== before.plan) {
        healed++
        logger.warn({ teamId: c.teamId, from: before.plan, to: r.plan, alert: 'billing.reconciliation_healed' }, '[reconcile] DB disagreed with Paddle — healed')
        await notifyPlanChange(c.teamId, r.plan, 'reconciled')
      }
    } catch (err: any) {
      logger.error({ err: err.message, teamId: c.teamId }, '[reconcile] team reconcile failed')
    }
  }
  logger.info({ checked: candidates.length, healed, anomalies }, '[reconcile] complete')
  return { checked: candidates.length, healed, anomalies }
}

export function runReconciliationCron() {
  return withCronLock('billing-reconciliation', 1500, () => runReconciliation())
}

// ── Read helper for the API ───────────────────────────────────────────────────

export { isLiveSubscriptionStatus }

// ── Pre-checkout guard ────────────────────────────────────────────────────────

/**
 * Refuse to start a new paid subscription when Paddle already bills this customer.
 * Fails CLOSED: if Paddle cannot be queried we cannot prove it is safe, and a duplicate charge is worse than a retry.
 */
export async function assertNoLiveSubscriptionInPaddle(
  teamId: string,
  paddleCustomerId: string,
  ctx: { requestId?: string; userId?: string } = {}
): Promise<void> {
  const { AppError } = await import('../../utils/errors')
  const { classifyPaddleError, logPaddleFailure, toClientError } = await import('../../services/paddle.errors')
  const { paddle } = await import('../../services/paddle.client')

  let live: any[]
  try {
    const page = await withTimeout(
      paddle.subscriptions.list({ customerId: [paddleCustomerId], status: [...LIVE_PADDLE_STATUSES] as any }).next(),
      PADDLE_CALL_TIMEOUT_MS,
      'paddle.subscriptions.list'
    )
    live = page ?? []
  } catch (err: any) {
    const failure = classifyPaddleError(err)
    logPaddleFailure(failure, { operation: 'subscriptions.list(pre-checkout)', teamId, ...ctx })
    if (failure.kind === 'permission') {
      // The API key lacks `subscription.read` (or is invalid). That is a deterministic operations problem, not
      // evidence of a duplicate; blocking every checkout on it would stop all revenue. The local-mirror guard
      // (past_due / paused / active checks above) still applies and the alert tells operations to fix the key.
      // transactions.create below fails loudly if the key is genuinely unusable.
      logger.error({ teamId, alert: 'billing.duplicate_guard_degraded' }, '[lifecycle] Paddle duplicate-subscription check skipped: API key lacks permission')
      return
    }
    // Network / 5xx / 429: cannot prove it is safe ⇒ fail CLOSED (a duplicate charge is worse than a retry).
    throw failure.kind === 'rate_limited' ? toClientError(failure, 'BILLING_ERROR') : new AppError('BILLING_TEMPORARILY_UNAVAILABLE', 503, 'Billing is temporarily unavailable. Please try again in a moment.')
  }

  if (live.length > 0) {
    // Heal the local mirror so the customer sees (and can manage) the subscription Paddle already has.
    await reconcileTeamFromPaddle(teamId).catch(() => undefined)
    throw new AppError('ACTIVE_SUBSCRIPTION_EXISTS', 409, 'This workspace already has an active subscription. Manage it from the billing portal.')
  }
}
