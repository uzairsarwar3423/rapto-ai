export interface KpiResult {
  value: number
  deltaPct: number
  direction: 'up' | 'down'
}

export interface DashboardOverview {
  totalRevenue: KpiResult
  mrr: KpiResult
  arpu: KpiResult
  activeSubscriptions: KpiResult
  growthRate: KpiResult // MoM MRR growth — computed from the same two snapshots, no extra query
  /** Churned MRR over the period ÷ MRR at period start (%). deltaPct is vs the previous equal-length period. */
  revenueChurn: KpiResult
  /** Churned teams over the period ÷ active teams at period start (%). */
  logoChurn: KpiResult
  /** Freshness of the underlying rollup — lets the UI show "Updated X ago" and warn when stale. */
  meta: OverviewMeta
}

export interface OverviewMeta {
  /** Date of the newest platform_metrics_daily row (YYYY-MM-DD), or null if the table is empty. */
  asOf: string | null
  /** When that row was last computed (ISO timestamp), or null if the table is empty. */
  computedAt: string | null
}

export interface TrendPoint {
  date: string
  value: number
}

export interface TrendResponse {
  points: TrendPoint[]
}

export interface MrrMovementPoint {
  date: string
  newMrr: number
  expansionMrr: number
  contractionMrr: number
  churnedMrr: number
  newCustomers?: number
}

export interface PlanMixSlice {
  label: string
  value: number
}

export interface CohortRow {
  cohortMonth: string
  points: Array<{ periodIndex: number; retainedPct: number }>
}

export interface TopTeamRow {
  teamId: string
  teamName: string
  mrrCents: number
  plan: string
}

export type Granularity = 'day' | 'week' | 'month'
