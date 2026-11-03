// ─────────────────────────────────────────────────────────────────────────────
// entitlement.ts — the ONE function that decides which plan a team may use.
//
// Pure (no I/O, injectable clock) so every caller — API gates, webhook handlers, cron sweeper,
// reconciliation — derives the same answer from the same facts.
//
// Layers kept separate on purpose:
//   Paddle transaction state  → Invoice rows
//   Subscription lifecycle    → Subscription.status / dates (mirror of Paddle)
//   Effective plan            → resolveEntitlement()  ← this file
//   Materialized plan         → Team.plan (written ONLY from resolveEntitlement, see syncTeamPlan)
//
// Server time is the only clock. Nothing here reads frontend values.
// ─────────────────────────────────────────────────────────────────────────────

import { PlanType, SubscriptionStatus } from '@prisma/client'

/** Grace window after a failed renewal (existing product behaviour: 7 days). */
export const PAST_DUE_GRACE_DAYS = 7

export interface EntitlementSubscription {
  status: SubscriptionStatus
  plan: PlanType
  trialEnd: Date | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
}

export interface EntitlementInput {
  /** Team.plan as stored. Only honoured when the team has NO subscription row (manual / enterprise grants). */
  teamPlan: PlanType
  gracePeriodEnd: Date | null
  subscription: EntitlementSubscription | null
}

export type EntitlementReason =
  | 'no_subscription'
  | 'active'
  | 'trialing'
  | 'trial_expired'
  | 'past_due_grace'
  | 'past_due_grace_expired'
  | 'cancel_scheduled'
  | 'cancelled_period_ended'
  | 'status_not_entitled'

export interface Entitlement {
  plan: PlanType
  reason: EntitlementReason
  /** Instant at which this answer stops being true (cache TTL / next sweeper action). null = no known expiry. */
  validUntil: Date | null
}

const FREE: PlanType = PlanType.FREE

export function resolveEntitlement(input: EntitlementInput, now: Date = new Date()): Entitlement {
  const sub = input.subscription

  // No subscription row: Team.plan is the explicit grant (FREE by default; ENTERPRISE is sold manually).
  if (!sub) {
    return { plan: input.teamPlan, reason: 'no_subscription', validUntil: null }
  }

  const t = now.getTime()

  switch (sub.status) {
    case SubscriptionStatus.trialing: {
      const end = sub.trialEnd ?? sub.currentPeriodEnd
      // Fail closed: a trial that cannot prove its end date is not entitled.
      if (!end || end.getTime() <= t) return { plan: FREE, reason: 'trial_expired', validUntil: null }
      return { plan: sub.plan, reason: 'trialing', validUntil: end }
    }

    case SubscriptionStatus.active: {
      // Scheduled cancellation: access lasts through the paid period, not beyond it.
      if (sub.cancelAtPeriodEnd) {
        const end = sub.currentPeriodEnd
        if (!end || end.getTime() <= t) return { plan: FREE, reason: 'cancelled_period_ended', validUntil: null }
        return { plan: sub.plan, reason: 'cancel_scheduled', validUntil: end }
      }
      return { plan: sub.plan, reason: 'active', validUntil: null }
    }

    case SubscriptionStatus.past_due: {
      const grace = input.gracePeriodEnd
      if (grace && grace.getTime() > t) return { plan: sub.plan, reason: 'past_due_grace', validUntil: grace }
      return { plan: FREE, reason: 'past_due_grace_expired', validUntil: null }
    }

    // cancelled (ended), paused, unpaid, incomplete, incomplete_expired, refunded
    default:
      return { plan: FREE, reason: 'status_not_entitled', validUntil: null }
  }
}

/** Convenience: seconds until the entitlement answer changes, capped; used as cache TTL. */
export function ttlSecondsUntil(validUntil: Date | null, maxSeconds: number, now: Date = new Date()): number {
  if (!validUntil) return maxSeconds
  const secs = Math.ceil((validUntil.getTime() - now.getTime()) / 1000)
  return Math.max(1, Math.min(maxSeconds, secs))
}

/** True for statuses where Paddle still considers the subscription alive (billing may continue). */
export function isLiveSubscriptionStatus(status: SubscriptionStatus): boolean {
  return (
    status === SubscriptionStatus.active ||
    status === SubscriptionStatus.trialing ||
    status === SubscriptionStatus.past_due ||
    status === SubscriptionStatus.paused
  )
}
