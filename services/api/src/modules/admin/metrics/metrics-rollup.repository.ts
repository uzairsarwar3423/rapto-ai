import { prisma } from '../../../db/client'
import type { DailyMetricsRow } from './metrics-row-builder'
import type { LiveSubscriptionRow } from './snapshot-builder'
import { dayStart, dayEndExclusive } from './utc-date'

export interface SnapshotRowInput {
  teamId: string
  plan: string
  amountCents: number
  status: string
}

const INSERT_CHUNK = 5_000

/**
 * All DB access for the rollup engine. Column names follow the real schema (camelCase, quoted in raw SQL).
 * If a column is ever renamed, change it HERE only — the service and worker do not depend on column names.
 */
export const metricsRollupRepository = {
  async readLiveSubscriptions(): Promise<LiveSubscriptionRow[]> {
    const rows = await prisma.subscription.findMany({
      select: { teamId: true, plan: true, status: true, unitAmount: true, billingInterval: true },
    })
    return rows.map((r) => ({
      teamId: r.teamId,
      plan: r.plan,
      status: r.status,
      unitAmountCents: r.unitAmount,
      billingInterval: r.billingInterval,
    }))
  },

  /**
   * Subscriptions that existed at the END of `date`, for backfill reconstruction.
   * Plan/amount are the CURRENT values — historic plan changes are unrecoverable (see backfill script).
   */
  async readSubscriptionsExistingAt(date: string) {
    const end = dayEndExclusive(date)
    return prisma.subscription.findMany({
      where: { createdAt: { lt: end } },
      select: {
        teamId: true, plan: true, status: true, unitAmount: true, billingInterval: true,
        createdAt: true, cancelledAt: true, updatedAt: true, trialStart: true, trialEnd: true,
      },
    })
  },

  /**
   * Replace-whole-day semantics: delete + insert in ONE transaction so a crash mid-write can never leave a
   * half-captured snapshot that the next diff would misread as mass churn. A transaction-scoped advisory lock
   * serializes concurrent writers (e.g. two worker replicas) without needing session-level locks, which are unsafe
   * behind PgBouncer.
   */
  async replaceSnapshot(date: string, rows: SnapshotRowInput[], source: 'LIVE' | 'RECONSTRUCTED'): Promise<void> {
    const d = dayStart(date)
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('admin_metrics_snapshot'))`
        await tx.subscriptionDailySnapshot.deleteMany({ where: { date: d } })
        for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
          await tx.subscriptionDailySnapshot.createMany({
            data: rows.slice(i, i + INSERT_CHUNK).map((r) => ({ ...r, date: d, source })),
          })
        }
      },
      { timeout: 60_000, maxWait: 10_000 },
    )
  },

  readSnapshot(date: string) {
    return prisma.subscriptionDailySnapshot.findMany({ where: { date: dayStart(date) } })
  },

  async hasSnapshot(date: string): Promise<boolean> {
    return (await prisma.subscriptionDailySnapshot.count({ where: { date: dayStart(date) }, take: 1 })) > 0
  },

  /** Revenue collected on the day, NET of refunds (paid invoices only). */
  async sumRevenueForDay(date: string): Promise<bigint> {
    const r = await prisma.$queryRaw<Array<{ s: bigint | null }>>`
      SELECT COALESCE(SUM(GREATEST("amountPaid" - "amountRefunded", 0)), 0)::bigint AS s
      FROM invoices
      WHERE status = 'paid' AND "paidAt" >= ${dayStart(date)} AND "paidAt" < ${dayEndExclusive(date)}`
    return r[0]?.s ?? 0n
  },

  /** Cumulative, recomputed from source every time → idempotent AND self-correcting after refunds. */
  async sumRevenueThrough(date: string): Promise<bigint> {
    const r = await prisma.$queryRaw<Array<{ s: bigint | null }>>`
      SELECT COALESCE(SUM(GREATEST("amountPaid" - "amountRefunded", 0)), 0)::bigint AS s
      FROM invoices
      WHERE status = 'paid' AND "paidAt" < ${dayEndExclusive(date)}`
    return r[0]?.s ?? 0n
  },

  countNewTeams(date: string): Promise<number> {
    return prisma.team.count({ where: { createdAt: { gte: dayStart(date), lt: dayEndExclusive(date) } } })
  },

  countTeamsThrough(date: string): Promise<number> {
    return prisma.team.count({ where: { createdAt: { lt: dayEndExclusive(date) } } })
  },

  /** Users that existed (and were not yet soft-deleted) at the end of `date`. */
  countUsersThrough(date: string): Promise<number> {
    const end = dayEndExclusive(date)
    return prisma.user.count({
      where: { createdAt: { lt: end }, OR: [{ deletedAt: null }, { deletedAt: { gte: end } }] },
    })
  },

  upsertDailyMetric(row: DailyMetricsRow) {
    const { date, ...rest } = row
    return prisma.platformMetricsDaily.upsert({
      where: { date },
      create: row,
      update: { ...rest, computedAt: new Date() },
    })
  },
}
