import { adminDashboardRepository as repo } from './admin-dashboard.repository'
import { bucketByGranularity } from './bucket-by-granularity'
import { redis } from '../../../config/redis'
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

async function cacheAside<T>(key: string, compute: () => Promise<T>): Promise<T> {
  try {
    const cached = await redis.get(key)
    if (cached) return JSON.parse(cached)
  } catch (err) {
    console.warn(`[adminDashboardService] Redis get cache error for ${key}:`, err)
  }

  const result = await compute()

  try {
    await redis.setex(key, CACHE_TTL_SECONDS, JSON.stringify(result))
  } catch (err) {
    console.warn(`[adminDashboardService] Redis setex cache error for ${key}:`, err)
  }

  return result
}

function computeDelta(startValue: number, endValue: number): KpiResult {
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

export const adminDashboardService = {
  async getOverview(from: string, to: string): Promise<DashboardOverview> {
    return cacheAside(`cache:admin:dashboard:overview:${from}:${to}`, async () => {
      const [startRow, endRow] = await Promise.all([
        repo.findMetricAt(from),
        repo.findMetricAt(to),
      ])

      const startMrr = Number(startRow.mrrCents)
      const endMrr = Number(endRow.mrrCents)

      const startActive = startRow.activeSubscriptions
      const endActive = endRow.activeSubscriptions

      const startArpu = Number(startRow.arpuCents)
      const endArpu = Number(endRow.arpuCents)

      const startRev = Number(startRow.totalRevenueCents)
      const endRev = Number(endRow.totalRevenueCents)

      const startRevChurn = Number(startRow.revenueChurnRate)
      const endRevChurn = Number(endRow.revenueChurnRate)

      const startLogoChurn = Number(startRow.logoChurnRate)
      const endLogoChurn = Number(endRow.logoChurnRate)

      return {
        totalRevenue: computeDelta(startRev, endRev),
        mrr: computeDelta(startMrr, endMrr),
        arpu: computeDelta(startArpu, endArpu),
        activeSubscriptions: computeDelta(startActive, endActive),
        growthRate: computeDelta(startMrr, endMrr),
        revenueChurn: computeDelta(startRevChurn, endRevChurn),
        logoChurn: computeDelta(startLogoChurn, endLogoChurn),
      }
    })
  },

  async getRevenueTrend(from: string, to: string, granularity: Granularity): Promise<TrendResponse> {
    return cacheAside(`cache:admin:dashboard:revenue-trend:${from}:${to}:${granularity}`, async () => {
      const rows = await repo.findMetricsInRange(from, to)
      const daily = rows.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        value: Number(r.totalRevenueCents),
      }))
      return { points: bucketByGranularity(daily, granularity, 'sum') }
    })
  },

  async getMrrTrend(from: string, to: string, granularity: Granularity): Promise<TrendResponse> {
    return cacheAside(`cache:admin:dashboard:mrr-trend:${from}:${to}:${granularity}`, async () => {
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
    return cacheAside(`cache:admin:dashboard:mrr-movement:${from}:${to}`, async () => {
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
    return cacheAside(`cache:admin:dashboard:cohort-retention:${months}`, async () => {
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
