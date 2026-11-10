/**
 * scripts/backfill-metrics.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Rebuild platform_metrics_daily (and the snapshots behind it) for a past date range.
 *
 *   npx tsx scripts/backfill-metrics.ts --from 2026-08-01 --to 2026-11-09 [--dry-run]
 *
 * For each date (ascending, sequential):
 *   1. reconstruct a subscription snapshot from createdAt / cancelledAt  (source = RECONSTRUCTED)
 *   2. compute the day's metrics row from snapshot(date-1) vs snapshot(date)
 *   3. write both (skipped with --dry-run)
 *
 * HONEST LIMITATION: reconstructed days show new + churn accurately but expansion/contraction as 0 — historic plan
 * changes are unrecoverable. Only LIVE snapshots (from the day the engine went live) have exact movement.
 *
 * This REPLACES existing rows (including the Day 1 seeded fake rows) for the covered range. Run --dry-run first.
 * Refuses ranges > 400 days. Never touches today's LIVE snapshot (stops at yesterday).
 */

import 'dotenv/config'
import { prisma } from '../src/db/client'
import { redis } from '../src/config/redis'
import { metricsRollupRepository as repo } from '../src/modules/admin/metrics/metrics-rollup.repository'
import { metricsRollupService } from '../src/modules/admin/metrics/metrics-rollup.service'
import { reconstructSnapshotAt, type HistoricSubscriptionRow } from '../src/modules/admin/metrics/snapshot-builder'
import { eachDay, prevDay, utcToday, assertIsoDate } from '../src/modules/admin/metrics/utc-date'
import { invalidateDashboardCache } from '../src/modules/admin/metrics/dashboard-cache'

const MAX_DAYS = 400

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const usd = (cents: bigint) => `$${(Number(cents) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

async function main() {
  const from = arg('from')
  const to = arg('to')
  const dryRun = process.argv.includes('--dry-run')

  if (!from || !to) throw new Error('Usage: backfill-metrics.ts --from YYYY-MM-DD --to YYYY-MM-DD [--dry-run]')
  assertIsoDate(from)
  assertIsoDate(to)
  if (from > to) throw new Error('`from` must be on or before `to`')
  if (to >= utcToday()) throw new Error(`\`to\` must be before today (${utcToday()}); today's snapshot is LIVE and owned by the worker`)

  const days = eachDay(from, to)
  if (days.length > MAX_DAYS) throw new Error(`Refusing a ${days.length}-day range (max ${MAX_DAYS})`)

  console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Backfilling ${days.length} day(s): ${from} → ${to}`)
  console.log('⚠  Reconstructed days: expansion/contraction MRR is unrecoverable and will be 0. New + churn are accurate.\n')

  // One query for all subscriptions; reconstruction is pure and per-date.
  const subs = (await repo.readSubscriptionsExistingAt(to)) as unknown as HistoricSubscriptionRow[]
  const rows = subs.map((s: any) => ({ ...s, unitAmountCents: s.unitAmount }) as HistoricSubscriptionRow)

  let prev = reconstructSnapshotAt(prevDay(from), rows)
  console.log('date        MRR        new MRR   churned MRR   active  new teams')
  console.log('──────────  ─────────  ────────  ────────────  ──────  ─────────')

  for (const date of days) {
    const today = reconstructSnapshotAt(date, rows)
    const row = await metricsRollupService.buildRow(date, prev, today)

    if (!dryRun) {
      await repo.replaceSnapshot(
        date,
        today.map((s) => ({ teamId: s.teamId, plan: s.planId, amountCents: s.amountCents, status: s.status })),
        'RECONSTRUCTED',
      )
      await repo.upsertDailyMetric(row)
    }

    console.log(
      `${date}  ${usd(row.mrrCents).padEnd(9)}  ${usd(row.newMrrCents).padEnd(8)}  ${usd(row.churnedMrrCents).padEnd(12)}  ${String(row.activeSubscriptions).padEnd(6)}  ${row.newTeams}`,
    )
    prev = today
  }

  if (dryRun) {
    console.log('\n[DRY RUN] nothing was written.')
  } else {
    await redis.connect().catch(() => undefined)
    const cleared = await invalidateDashboardCache().catch(() => 0)
    console.log(`\n✓ Backfilled ${days.length} day(s). Cleared ${cleared} cached dashboard response(s).`)
  }
}

main()
  .catch((err) => {
    console.error('✗', err.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
    redis.disconnect()
  })
