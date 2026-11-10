import { metricsRollupRepository as repo } from './metrics-rollup.repository'
import { buildSnapshotRows } from './snapshot-builder'
import { buildDailyMetricsRow, type DailyMetricsRow } from './metrics-row-builder'
import { utcToday, prevDay } from './utc-date'
import { logger } from '../../../config/logger'
import type { SubscriptionSnapshot } from './metrics.types'

const toSnap = (r: { teamId: string; plan: string; amountCents: number; status: string }): SubscriptionSnapshot => ({
  teamId: r.teamId,
  planId: r.plan,
  amountCents: r.amountCents,
  status: r.status as SubscriptionSnapshot['status'],
})

/**
 * Orchestration only — all arithmetic lives in pure modules (snapshot-builder, team-movement, metrics-row-builder).
 *
 * Invariant: live subscription state is read in exactly ONE place (captureTodaySnapshot). Everything else is
 * snapshot-vs-snapshot, so re-running any past day is reproducible.
 */
export const metricsRollupService = {
  /** Capture LIVE subscription state as the snapshot for UTC "today". Safe to call any number of times. */
  async captureTodaySnapshot(): Promise<number> {
    const live = await repo.readLiveSubscriptions()
    const rows = buildSnapshotRows(live).map((s) => ({
      teamId: s.teamId,
      plan: s.planId,
      amountCents: s.amountCents,
      status: s.status,
    }))
    await repo.replaceSnapshot(utcToday(), rows, 'LIVE')
    return rows.length
  },

  /**
   * Compute ONE day's metrics row purely from stored snapshots (date vs date-1).
   * Deterministic: the same snapshots always produce the same row.
   */
  async computeDay(date: string): Promise<DailyMetricsRow> {
    const [todayRows, hasPrev] = await Promise.all([repo.readSnapshot(date), repo.hasSnapshot(prevDay(date))])
    const today = todayRows.map(toSnap)

    // Worst failure mode of any rollup: silently overwriting a real day with zeros after a partial failure.
    if (today.length === 0 && (await repo.readLiveSubscriptions()).length > 0) {
      throw new Error(`computeDay(${date}): no snapshot for date — refusing to write a zeroed row over real data`)
    }

    // No previous snapshot (first ever run, or a missed day): use `today` as its own baseline so the first row shows
    // NO movement rather than the entire MRR as a fake "new" spike. Logged loudly so it is never silent.
    let prev = today
    if (hasPrev) {
      prev = (await repo.readSnapshot(prevDay(date))).map(toSnap)
    } else {
      logger.warn({ date }, 'rollup: no previous-day snapshot — movement for this day recorded as zero')
    }

    const row = await this.buildRow(date, prev, today)
    await repo.upsertDailyMetric(row)
    return row
  },

  /**
   * Build (but do NOT write) one day's row: revenue and team/user counts are read from source, movement comes from
   * the two snapshots passed in. Shared by computeDay and the backfill script's --dry-run.
   */
  async buildRow(date: string, prev: SubscriptionSnapshot[], today: SubscriptionSnapshot[]): Promise<DailyMetricsRow> {
    const [daily, cumulative, newTeams, totalTeams, totalUsers] = await Promise.all([
      repo.sumRevenueForDay(date),
      repo.sumRevenueThrough(date),
      repo.countNewTeams(date),
      repo.countTeamsThrough(date),
      repo.countUsersThrough(date),
    ])

    return buildDailyMetricsRow({
      date,
      prev,
      today,
      dailyRevenueCents: daily,
      cumulativeRevenueCents: cumulative,
      newTeams,
      totalTeams,
      totalUsers,
    })
  },

  /** 00:15 UTC. Finalize yesterday from stored snapshots, then open today. */
  async finalizeNightly(): Promise<{ finalized: string | null; opened: string }> {
    const today = utcToday()
    const yesterday = prevDay(today)

    let finalized: string | null = null
    if (await repo.hasSnapshot(yesterday)) {
      await this.computeDay(yesterday)
      finalized = yesterday
    } else {
      // Cannot compute a truthful row without a snapshot. Leave the existing row untouched and shout.
      logger.error(
        { date: yesterday, alert: 'metrics.rollup_missing_snapshot' },
        'rollup: no snapshot for yesterday — skipping finalization; run scripts/backfill-metrics.ts to repair',
      )
    }

    await this.captureTodaySnapshot() // guarantees today has a snapshot even with zero billing events
    await this.computeDay(today)
    if (today.endsWith('-01')) await this.recomputeCohortRetention()
    return { finalized, opened: today }
  },

  /** Webhook-triggered, debounced. Refresh only today. */
  async recomputeToday(): Promise<DailyMetricsRow> {
    await this.captureTodaySnapshot()
    return this.computeDay(utcToday())
  },

  async recomputeCohortRetention(): Promise<void> {
    // Real implementation is scheduled with the cohort work (needs 2+ months of snapshot history to be meaningful).
    logger.info('rollup: cohort retention recompute hook invoked')
  },
}
