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
import { entityToSnake, extractSubscriptionData, parsePaddleDate, resolvePlan } from '../webhooks/paddle.mapper'

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

export type ReconcileOutcome =
  | 'synced'              // DB changed to match Paddle
  | 'no_change'           // DB already matched Paddle
  | 'no_subscription'     // Paddle has nothing live (and nothing to repair) for this customer
  | 'paddle_unavailable'  // could not read Paddle — NOTHING was verified
  | 'unmappable'          // Paddle returned a subscription we cannot map (unconfigured price, bad payload)
  | 'not_applied'         // mapped, but refused by the persistence guards

export interface ReconcileResult {
  /** true only when the DB is known to agree with Paddle after this call (synced / no_change). */
  synced: boolean
  outcome: ReconcileOutcome
  plan: PlanType
  status?: SubscriptionStatus
  subscriptionId?: string
  trialEnd?: Date | null
  currentPeriodEnd?: Date | null
  anomalies: string[]
}

const LIVE_STATUS_PRIORITY: Record<string, number> = { active: 0, trialing: 1, past_due: 2, paused: 3 }
const isLivePaddleStatus = (s: unknown) => typeof s === 'string' && s in LIVE_STATUS_PRIORITY

/**
 * Which Paddle subscription is THE subscription for this team?
 *
 *  1. The one we already track — but only while Paddle still considers it LIVE.
 *  2. Otherwise a stored subscription that is dead in Paddle (cancelled / expired trial) must NOT win: the customer's
 *     new live subscription replaces it (this is "Free → Growth" after an earlier trial).
 *  3. Among several live ones prefer active > trialing > past_due > paused, then the newest.
 *
 * `extras` are the OTHER live subscriptions — only these are genuine duplicates.
 */
export function chooseAuthoritativeSubscription(
  storedSnap: any | null,
  liveFromList: any[]
): { chosen: any | null; extras: any[] } {
  const storedLive = storedSnap && isLivePaddleStatus(storedSnap.status) ? storedSnap : null
  const liveById = new Map<string, any>()
  for (const s of liveFromList) if (isLivePaddleStatus(s.status)) liveById.set(s.id, s)
  if (storedLive) liveById.set(storedLive.id, storedLive)

  if (storedLive) {
    return { chosen: storedLive, extras: [...liveById.values()].filter((s) => s.id !== storedLive.id) }
  }
  const ranked = [...liveById.values()].sort(
    (a, b) =>
      LIVE_STATUS_PRIORITY[a.status] - LIVE_STATUS_PRIORITY[b.status] ||
      String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
  )
  if (ranked.length > 0) return { chosen: ranked[0], extras: ranked.slice(1) }
  return { chosen: storedSnap, extras: [] } // nothing live: apply the stored subscription's real (dead) state
}

export async function reconcileTeamFromPaddle(teamId: string): Promise<ReconcileResult> {
  const anomalies: string[] = []
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true, paddleCustomerId: true } })
  const stored = await billingRepo.findFullSubscriptionByTeam(teamId)

  const effective = async (
    extra: Omit<ReconcileResult, 'plan' | 'anomalies' | 'synced'> & { synced?: boolean }
  ): Promise<ReconcileResult> => {
    const ent = await getTeamEntitlement(teamId)
    return { ...extra, synced: extra.synced ?? false, plan: ent.plan, anomalies }
  }

  if (!team || (!team.paddleCustomerId && !stored)) {
    return effective({ outcome: 'no_subscription' })
  }

  const { paddle } = await import('../../services/paddle.client')
  const customerIds = [...new Set([team.paddleCustomerId, stored?.paddleCustomerId].filter(Boolean) as string[])]

  // 1. The subscription we track, read by id (authoritative for ITS state).
  let storedSnap: any | null = null
  if (stored) {
    try {
      storedSnap = entityToSnake(
        await withTimeout(paddle.subscriptions.get(stored.paddleSubscriptionId), PADDLE_CALL_TIMEOUT_MS, 'paddle.subscriptions.get')
      )
    } catch (err: any) {
      if (err?.code === 'not_found') {
        anomalies.push('stored_subscription_not_found_in_paddle')
      } else {
        logger.error({ err: err.message, teamId, alert: 'billing.reconcile_paddle_unavailable' }, '[lifecycle] Paddle read failed — nothing verified')
        return effective({ outcome: 'paddle_unavailable', status: stored.status, subscriptionId: stored.paddleSubscriptionId })
      }
    }
  }

  // 2. Every live subscription of this customer.
  let listed: any[] = []
  let listFailed = false
  try {
    const page = await withTimeout(
      paddle.subscriptions.list({ customerId: customerIds, status: [...LIVE_PADDLE_STATUSES] as any }).next(),
      PADDLE_CALL_TIMEOUT_MS,
      'paddle.subscriptions.list'
    )
    listed = (page ?? []).map((s: any) => entityToSnake(s))
  } catch (err: any) {
    listFailed = true
    logger.warn({ err: err.message, teamId }, '[lifecycle] Paddle list failed')
  }
  const storedIsLive = storedSnap && isLivePaddleStatus(storedSnap.status)
  if (listFailed && !storedIsLive) {
    // Cannot tell whether a newer live subscription exists — do not pretend we verified anything.
    return effective({ outcome: 'paddle_unavailable', status: stored?.status, subscriptionId: stored?.paddleSubscriptionId })
  }

  // 3. Decide, then report duplicates ONLY when more than one subscription is genuinely live.
  const { chosen, extras } = chooseAuthoritativeSubscription(storedSnap, listed)
  if (extras.length > 0) {
    anomalies.push(`additional_live_paddle_subscriptions:${extras.map((s) => s.id).join(',')}`)
    logger.error(
      { teamId, tracked: chosen?.id, ids: extras.map((s) => s.id), alert: 'billing.duplicate_subscription' },
      '[lifecycle] ALERT: customer has more than one live Paddle subscription (ids = the extra ones; none was cancelled)'
    )
  }

  logger.info(
    {
      teamId,
      stored: stored ? { id: stored.paddleSubscriptionId, status: stored.status } : null,
      paddleStored: storedSnap ? { id: storedSnap.id, status: storedSnap.status } : null,
      paddleLive: listed.map((s) => ({ id: s.id, status: s.status })),
      chosen: chosen ? { id: chosen.id, status: chosen.status } : null,
    },
    '[lifecycle] reconcile decision'
  )

  if (!chosen) return effective({ outcome: 'no_subscription', status: stored?.status, subscriptionId: stored?.paddleSubscriptionId })

  // 3b. Our row says "live" but Paddle says the tracked subscription is dead: retire it first, otherwise the guards
  //     rightly refuse to replace a live-looking subscription with a different one.
  if (
    stored && chosen.id !== stored.paddleSubscriptionId && storedSnap && !isLivePaddleStatus(storedSnap.status) &&
    isLiveSubscriptionStatus(stored.status)
  ) {
    await billingRepo.retireDeadSubscription(teamId, stored.paddleSubscriptionId, parsePaddleDate(storedSnap.canceled_at) ?? null)
  }

  // 4. Map and persist through the single writer.
  let data
  try {
    const { planId, interval } = resolvePlan(chosen)
    data = extractSubscriptionData(chosen, planId, interval)
  } catch (err: any) {
    logger.error({ err: err.message, teamId, paddleSubscriptionId: chosen.id, alert: 'billing.reconcile_failed' }, '[lifecycle] could not map Paddle subscription')
    anomalies.push(`unmappable:${err.message}`)
    return effective({ outcome: 'unmappable', subscriptionId: chosen.id })
  }

  const before = stored
  const result = await billingRepo.applySubscriptionState({
    teamId,
    data,
    source: 'sync',
    audit: { eventType: 'system.reconcile', action: 'RECONCILED_FROM_PADDLE', payload: { paddleSubscriptionId: data.paddleSubscriptionId, status: data.status, anomalies } },
  })
  if (!result.applied) {
    anomalies.push(result.reason ?? 'not_applied')
    return effective({ outcome: 'not_applied', status: data.status, subscriptionId: data.paddleSubscriptionId })
  }

  // Cache invalidation strictly AFTER the commit above.
  await invalidatePlanCache(teamId)

  const after = await billingRepo.findFullSubscriptionByTeam(teamId)
  const changed =
    !before ||
    before.paddleSubscriptionId !== after?.paddleSubscriptionId ||
    before.status !== after?.status ||
    before.plan !== after?.plan ||
    before.currentPeriodEnd?.getTime() !== after?.currentPeriodEnd?.getTime() ||
    before.trialEnd?.getTime() !== after?.trialEnd?.getTime() ||
    before.cancelAtPeriodEnd !== after?.cancelAtPeriodEnd
  return effective({
    synced: true,
    outcome: changed ? 'synced' : 'no_change',
    status: after?.status,
    subscriptionId: after?.paddleSubscriptionId,
    trialEnd: after?.trialEnd ?? null,
    currentPeriodEnd: after?.currentPeriodEnd ?? null,
  })
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
