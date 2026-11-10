import type { SubscriptionSnapshot } from './metrics.types'
import { mrrCalculator } from './mrr-calculator.service'
import { churnCalculator } from './churn-calculator.service'
import { countTeamMovement } from './team-movement'
import { dayStart } from './utc-date'

export interface DailyMetricsRow {
  date: Date
  dailyRevenueCents: bigint
  totalRevenueCents: bigint
  mrrCents: bigint
  arrCents: bigint
  newMrrCents: bigint
  expansionMrrCents: bigint
  contractionMrrCents: bigint
  churnedMrrCents: bigint
  activeSubscriptions: number
  newTeams: number
  churnedTeams: number
  totalTeams: number
  totalUsers: number
  arpuCents: number
  logoChurnRate: number
  revenueChurnRate: number
}

export interface DailyMetricsInput {
  date: string
  prev: SubscriptionSnapshot[]
  today: SubscriptionSnapshot[]
  dailyRevenueCents: bigint
  cumulativeRevenueCents: bigint
  newTeams: number
  totalTeams: number
  totalUsers: number
}

/**
 * Pure: the same inputs always produce the same row → computeDay() is idempotent by construction.
 *
 * Sign convention (final, see Day 5 handoff): contraction and churned MRR are stored POSITIVE.
 * Only the dashboard API layer negates them for charting. Never store negatives.
 */
export function buildDailyMetricsRow(i: DailyMetricsInput): DailyMetricsRow {
  // Movement is computed over PAYING (active) subscriptions only, so it agrees with sumActiveMrr and countTeamMovement:
  // trialing → active is "new" (conversion), active → past_due is "churned". The Day 3 calculator stays untouched.
  const paying = (s: SubscriptionSnapshot[]) => s.filter((x) => x.status === 'active')
  const movement = mrrCalculator.calculateMrrMovement(paying(i.prev), paying(i.today))
  const teams = countTeamMovement(i.prev, i.today)
  const mrr = mrrCalculator.sumActiveMrr(i.today)
  const prevMrr = mrrCalculator.sumActiveMrr(i.prev)

  return {
    date: dayStart(i.date),
    dailyRevenueCents: i.dailyRevenueCents,
    totalRevenueCents: i.cumulativeRevenueCents,
    mrrCents: BigInt(mrr),
    arrCents: BigInt(mrr) * 12n,
    newMrrCents: BigInt(movement.newMrr),
    expansionMrrCents: BigInt(movement.expansionMrr),
    contractionMrrCents: BigInt(movement.contractionMrr),
    churnedMrrCents: BigInt(movement.churnedMrr),
    activeSubscriptions: teams.activeNow,
    newTeams: i.newTeams,
    churnedTeams: teams.churned,
    totalTeams: i.totalTeams,
    totalUsers: i.totalUsers,
    arpuCents: mrrCalculator.calculateArpu(mrr, teams.activeNow),
    logoChurnRate: churnCalculator.calculateLogoChurnRate(teams.activeAtStart, teams.churned),
    revenueChurnRate: churnCalculator.calculateRevenueChurnRate(prevMrr, movement.churnedMrr),
  }
}
