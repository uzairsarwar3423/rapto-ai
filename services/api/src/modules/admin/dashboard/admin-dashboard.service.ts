import { adminDashboardRepository as repo } from './admin-dashboard.repository'
import { bucketByGranularity } from './bucket-by-granularity'
import { churnCalculator } from '../metrics/churn-calculator.service'
import { addDaysUtc, daysBetween } from '../metrics/utc-date'
import { cacheAside } from '../shared/cache-aside'
import type {
  DashboardOverview,
  KpiResult,
  TrendResponse,
  MrrMovementPoint,
  PlanMixSlice,
  CohortRow,
  TopTeamRow,
  Granularity,
} from './admin-dashboard.types'

const CACHE_TTL_SECONDS = 300

export function computeDelta(startValue: number, endValue: number): KpiResult {
  if (startValue === 0) {
    // Zero-division guard, same pattern established Day 3 — going from $0 to anything
    // positive isn't a meaningful "% growth," so surface it as a flat 0% rather than Infinity.
    return { value: endValue, deltaPct: 0, direction: 'up' }
  }
  const deltaPct = ((endValue - startValue) / startValue) * 100
  return {
    value: endValue,
    deltaPct: Math.round(Math.abs(deltaPct) * 10) / 10,
    direction: deltaPct >= 0 ? 'up' : 'down',
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100
const sum = <T>(rows: T[], pick: (r: T) => number) => rows.reduce((s, r) => s + pick(r), 0)

/** The equal-length period immediately before [from, to] — the comparison window for period KPIs. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const length = daysBetween(from, to) + 1
  const prevTo = addDaysUtc(from, -1)
  return { from: addDaysUtc(prevTo, -(length - 1)), to: prevTo }
}

export const adminDashboardService = {
  async getOverview(from: string, to: string): Promise<DashboardOverview> {
    return cacheAside(`cache:admin:dashboard:overview:${from}:${to}`, CACHE_TTL_SECONDS, async () => {
      const prev = previousPeriod(from, to)

      const [startRow, endRow, rows, prevStartRow, prevRows, latest] = await Promise.all([
        repo.findMetricAt(from),
        repo.findMetricAt(to),
        repo.findMetricsInRange(from, to),
        repo.findMetricAt(prev.from),
        repo.findMetricsInRange(prev.from, prev.to),
        repo.findLatestMetricMeta(),
      ])

      const startMrr = Number(startRow.mrrCents)
      const endMrr = Number(endRow.mrrCents)

      // Total Revenue = revenue COLLECTED in the selected range vs the previous equal-length range.
      // (total_revenue_cents is a cumulative counter — its delta is not "revenue in the period".)
      const periodRevenue = sum(rows, (r) => Number(r.dailyRevenueCents))
      const prevPeriodRevenue = sum(prevRows, (r) => Number(r.dailyRevenueCents))

      // Revenue churn % = Σ churned MRR over the period ÷ MRR at period start.
      const revenueChurnPct = round2(
        churnCalculator.calculateRevenueChurnRate(startMrr, sum(rows, (r) => Number(r.churnedMrrCents))),
      )
      const prevRevenueChurnPct = round2(
        churnCalculator.calculateRevenueChurnRate(
          Number(prevStartRow.mrrCents),
          sum(prevRows, (r) => Number(r.churnedMrrCents)),
        ),
      )

      // Logo churn % = Σ churned teams over the period ÷ active teams at period start.
      const logoChurnPct = round2(
        churnCalculator.calculateLogoChurnRate(startRow.activeSubscriptions, sum(rows, (r) => r.churnedTeams)),
      )
      const prevLogoChurnPct = round2(
        churnCalculator.calculateLogoChurnRate(
          prevStartRow.activeSubscriptions,
          sum(prevRows, (r) => r.churnedTeams),
        ),
      )

      return {
        totalRevenue: computeDelta(prevPeriodRevenue, periodRevenue),
        mrr: computeDelta(startMrr, endMrr),
        arpu: computeDelta(Number(startRow.arpuCents), Number(endRow.arpuCents)),
        activeSubscriptions: computeDelta(startRow.activeSubscriptions, endRow.activeSubscriptions),
        growthRate: computeDelta(startMrr, endMrr),
        // The API reports facts (churn went up/down); the UI owns the value judgement via goodDirection="down".
        revenueChurn: computeDelta(prevRevenueChurnPct, revenueChurnPct),
        logoChurn: computeDelta(prevLogoChurnPct, logoChurnPct),
        meta: {
          asOf: latest ? latest.date.toISOString().slice(0, 10) : null,
          computedAt: latest ? latest.computedAt.toISOString() : null,
        },
      }
    })
  },

  async getRevenueTrend(from: string, to: string, granularity: Granularity): Promise<TrendResponse> {
    return cacheAside(`cache:admin:dashboard:revenue-trend:${from}:${to}:${granularity}`, CACHE_TTL_SECONDS, async () => {
      const rows = await repo.findMetricsInRange(from, to)
      // Per-DAY revenue, so summing into weekly/monthly buckets is mathematically valid.
      const daily = rows.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        value: Number(r.dailyRevenueCents),
      }))
      return { points: bucketByGranularity(daily, granularity, 'sum') }
    })
  },

  async getMrrTrend(from: string, to: string, granularity: Granularity): Promise<TrendResponse> {
    return cacheAside(`cache:admin:dashboard:mrr-trend:${from}:${to}:${granularity}`, CACHE_TTL_SECONDS, async () => {
      const rows = await repo.findMetricsInRange(from, to)
      const daily = rows.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        value: Number(r.mrrCents),
      }))
      // MRR is a level, not a flow — average, don't sum, across a bucket
      return { points: bucketByGranularity(daily, granularity, 'average') }
    })
  },

  async getMrrMovement(from: string, to: string): Promise<MrrMovementPoint[]> {
    return cacheAside(`cache:admin:dashboard:mrr-movement:${from}:${to}`, CACHE_TTL_SECONDS, async () => {
      const rows = await repo.findMetricsInRange(from, to)
      return rows.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        newMrr: Number(r.newMrrCents),
        expansionMrr: Number(r.expansionMrrCents),
        contractionMrr: -Number(r.contractionMrrCents), // negative — renders BELOW the axis in stacked bar
        churnedMrr: -Number(r.churnedMrrCents),         // negative — losses read as visually down
        newCustomers: r.newTeams,
      }))
    })
  },

  async getPlanMix(at?: string): Promise<PlanMixSlice[]> {
    // Live query from subscriptions table
    const targetDate = at ?? new Date().toISOString().slice(0, 10)
    const rows = await repo.findPlanMix(targetDate)
    return rows.map((r) => ({
      label: r.plan,
      value: Number(r.totalCents),
    }))
  },

  async getCohortRetention(months: number): Promise<CohortRow[]> {
    return cacheAside(`cache:admin:dashboard:cohort-retention:${months}`, CACHE_TTL_SECONDS, async () => {
      const rows = await repo.findCohortRetention(months)
      const byMonth = new Map<string, CohortRow>()

      for (const row of rows) {
        const key = row.cohortMonth.toISOString().slice(0, 7)
        if (!byMonth.has(key)) byMonth.set(key, { cohortMonth: key, points: [] })
        byMonth.get(key)!.points.push({
          periodIndex: row.periodIndex,
          retainedPct: row.retainedPct,
        })
      }

      return [...byMonth.values()]
    })
  },

  async getTopTeams(limit: number): Promise<TopTeamRow[]> {
    // Live query from subscriptions JOIN teams
    const rows = await repo.findTopTeamsByMrr(limit)
    return rows.map((r) => ({
      teamId: r.teamId,
      teamName: r.teamName,
      mrrCents: Number(r.mrrCents),
      plan: r.plan,
    }))
  },
}
