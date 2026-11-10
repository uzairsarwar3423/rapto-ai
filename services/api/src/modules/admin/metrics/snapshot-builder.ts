import type { SubscriptionSnapshot } from './metrics.types'
import { dayEndExclusive } from './utc-date'

/** Live `subscriptions` row, already narrowed to what the rollup needs. */
export interface LiveSubscriptionRow {
  teamId: string
  plan: string
  status: string
  unitAmountCents: number | null
  /** 'month' | 'year' — anything else (null, unknown) is treated as monthly. */
  billingInterval: string | null
}

/**
 * MRR is always MONTHLY. An annual $990 plan contributes 8250 cents of MRR per month.
 * Skipping this normalization is the classic bug that inflates MRR 12x for annual customers.
 */
export function toMonthlyAmountCents(row: Pick<LiveSubscriptionRow, 'unitAmountCents' | 'billingInterval'>): number {
  const amount = row.unitAmountCents ?? 0
  return row.billingInterval === 'year' ? Math.round(amount / 12) : amount
}

export function normalizeStatus(raw: string): SubscriptionSnapshot['status'] {
  switch (raw) {
    case 'active':
    case 'trialing':
    case 'past_due':
      return raw
    default:
      // paused / cancelled / incomplete / unpaid / refunded / unknown → never counted as revenue
      return 'cancelled'
  }
}

export function buildSnapshotRows(live: LiveSubscriptionRow[]): SubscriptionSnapshot[] {
  return live.map((r) => ({
    teamId: r.teamId,
    planId: r.plan,
    amountCents: toMonthlyAmountCents(r),
    status: normalizeStatus(r.status),
  }))
}

/** A subscription row with the timestamps needed to reconstruct its state on a past day (backfill only). */
export interface HistoricSubscriptionRow extends LiveSubscriptionRow {
  createdAt: Date
  cancelledAt: Date | null
  updatedAt: Date
  trialStart: Date | null
  trialEnd: Date | null
}

/**
 * Reconstruct who was subscribed at the END of `date` from createdAt / cancelledAt.
 *
 * HONEST LIMITATION: plan and amount are the CURRENT values — historic plan changes are unrecoverable, so
 * reconstructed days show new + churn accurately but expansion/contraction as 0. Only LIVE snapshots (captured from
 * the day the engine went live) have exact movement.
 *
 *  - A subscription that is cancelled now but has no cancelledAt is treated as cancelled at its updatedAt.
 *  - Status on a historic day is 'trialing' inside its trial window, otherwise 'active' (a currently past_due
 *    subscription is assumed to have been active historically).
 */
export function reconstructSnapshotAt(date: string, rows: HistoricSubscriptionRow[]): SubscriptionSnapshot[] {
  const end = dayEndExclusive(date)
  const out: SubscriptionSnapshot[] = []

  for (const r of rows) {
    if (r.createdAt >= end) continue
    const effectiveCancel = r.cancelledAt ?? (normalizeStatus(r.status) === 'cancelled' ? r.updatedAt : null)
    if (effectiveCancel && effectiveCancel < end) continue

    const inTrial = !!r.trialStart && !!r.trialEnd && r.trialStart < end && r.trialEnd >= end
    out.push({
      teamId: r.teamId,
      planId: r.plan,
      amountCents: toMonthlyAmountCents(r),
      status: inTrial ? 'trialing' : 'active',
    })
  }
  return out
}
