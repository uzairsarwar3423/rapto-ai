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
  revenueChurn?: KpiResult
  logoChurn?: KpiResult
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
