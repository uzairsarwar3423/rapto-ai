import {
  toMonthlyAmountCents,
  normalizeStatus,
  buildSnapshotRows,
  reconstructSnapshotAt,
  type HistoricSubscriptionRow,
} from '../../../src/modules/admin/metrics/snapshot-builder'
import { countTeamMovement } from '../../../src/modules/admin/metrics/team-movement'
import { buildDailyMetricsRow } from '../../../src/modules/admin/metrics/metrics-row-builder'
import { addDaysUtc, prevDay, eachDay, daysBetween, dayStart, dayEndExclusive } from '../../../src/modules/admin/metrics/utc-date'
import type { SubscriptionSnapshot } from '../../../src/modules/admin/metrics/metrics.types'

const snap = (teamId: string, amountCents: number, status: SubscriptionSnapshot['status'] = 'active', planId = 'GROWTH'): SubscriptionSnapshot => ({
  teamId,
  planId,
  amountCents,
  status,
})

describe('toMonthlyAmountCents', () => {
  it('leaves monthly plans unchanged', () =>
    expect(toMonthlyAmountCents({ unitAmountCents: 7900, billingInterval: 'month' })).toBe(7900))
  it('divides annual plans by 12 (never inflates MRR 12x)', () =>
    expect(toMonthlyAmountCents({ unitAmountCents: 79000, billingInterval: 'year' })).toBe(6583))
  it('treats null interval as monthly and null amount as 0', () => {
    expect(toMonthlyAmountCents({ unitAmountCents: 500, billingInterval: null })).toBe(500)
    expect(toMonthlyAmountCents({ unitAmountCents: null, billingInterval: 'month' })).toBe(0)
  })
})

describe('normalizeStatus / buildSnapshotRows', () => {
  it.each(['active', 'trialing', 'past_due'])('keeps %s', (s) => expect(normalizeStatus(s)).toBe(s))
  it.each(['paused', 'cancelled', 'incomplete', 'unpaid', 'refunded', 'weird'])(
    'maps %s to cancelled so it never counts as revenue',
    (s) => expect(normalizeStatus(s)).toBe('cancelled'),
  )
  it('normalizes interval and status together', () => {
    const [row] = buildSnapshotRows([
      { teamId: 't1', plan: 'BUSINESS', status: 'paused', unitAmountCents: 12000, billingInterval: 'year' },
    ])
    expect(row).toEqual({ teamId: 't1', planId: 'BUSINESS', amountCents: 1000, status: 'cancelled' })
  })
})

describe('countTeamMovement', () => {
  it('counts active→missing as churned', () =>
    expect(countTeamMovement([snap('a', 100)], []).churned).toBe(1))
  it('counts active→past_due as churned (matches sumActiveMrr exclusion)', () =>
    expect(countTeamMovement([snap('a', 100)], [snap('a', 100, 'past_due')]).churned).toBe(1))
  it('counts missing→active as newPaying', () =>
    expect(countTeamMovement([], [snap('a', 100)]).newPaying).toBe(1))
  it('counts trialing→active as newPaying (trial conversion)', () =>
    expect(countTeamMovement([snap('a', 100, 'trialing')], [snap('a', 100)]).newPaying).toBe(1))
  it('does not count trialing as paying at start or now', () => {
    const m = countTeamMovement([snap('a', 100, 'trialing')], [snap('a', 100, 'trialing')])
    expect(m).toEqual({ newPaying: 0, churned: 0, activeAtStart: 0, activeNow: 0 })
  })
  it('returns zeros for two empty snapshots', () =>
    expect(countTeamMovement([], [])).toEqual({ newPaying: 0, churned: 0, activeAtStart: 0, activeNow: 0 }))
})

describe('buildDailyMetricsRow', () => {
  const base = { date: '2026-11-10', dailyRevenueCents: 500n, cumulativeRevenueCents: 9_000n, newTeams: 1, totalTeams: 10, totalUsers: 40 }

  it('stores contraction and churn POSITIVE and computes expansion from a plan change', () => {
    const prev = [snap('a', 1000), snap('b', 3000), snap('c', 2000)]
    const today = [snap('a', 1500), snap('b', 2000)] // a expands +500, b contracts -1000, c churns 2000
    const row = buildDailyMetricsRow({ ...base, prev, today })
    expect(row.expansionMrrCents).toBe(500n)
    expect(row.contractionMrrCents).toBe(1000n)
    expect(row.churnedMrrCents).toBe(2000n)
    expect(row.mrrCents).toBe(3500n)
    expect(row.arrCents).toBe(42_000n)
    expect(row.churnedTeams).toBe(1)
    expect(row.revenueChurnRate).toBeCloseTo((2000 / 6000) * 100)
  })

  it('treats a trialing team as not paying: no MRR, no "new MRR" until it converts', () => {
    const row = buildDailyMetricsRow({ ...base, prev: [], today: [snap('t', 5000, 'trialing')] })
    expect(row.mrrCents).toBe(0n)
    expect(row.newMrrCents).toBe(0n)
    expect(row.activeSubscriptions).toBe(0)
  })

  it('is deterministic — identical inputs yield an identical row (idempotency by construction)', () => {
    const input = { ...base, prev: [snap('a', 100)], today: [snap('a', 200), snap('b', 50)] }
    expect(buildDailyMetricsRow(input)).toEqual(buildDailyMetricsRow(input))
  })

  it('guards divide-by-zero (no active subscriptions)', () => {
    const row = buildDailyMetricsRow({ ...base, prev: [], today: [] })
    expect(row.arpuCents).toBe(0)
    expect(row.logoChurnRate).toBe(0)
    expect(row.revenueChurnRate).toBe(0)
  })
})

describe('reconstructSnapshotAt', () => {
  const sub = (o: Partial<HistoricSubscriptionRow>): HistoricSubscriptionRow => ({
    teamId: 't', plan: 'GROWTH', status: 'active', unitAmountCents: 1000, billingInterval: 'month',
    createdAt: new Date('2026-10-01T10:00:00Z'), cancelledAt: null, updatedAt: new Date('2026-10-01T10:00:00Z'),
    trialStart: null, trialEnd: null, ...o,
  })

  it('excludes subscriptions created after the day', () =>
    expect(reconstructSnapshotAt('2026-09-30', [sub({})])).toHaveLength(0))
  it('includes a subscription on the day it is created (end-of-day semantics)', () =>
    expect(reconstructSnapshotAt('2026-10-01', [sub({})])).toHaveLength(1))
  it('excludes it from the day it was cancelled', () => {
    const s = sub({ cancelledAt: new Date('2026-10-05T08:00:00Z') })
    expect(reconstructSnapshotAt('2026-10-04', [s])).toHaveLength(1)
    expect(reconstructSnapshotAt('2026-10-05', [s])).toHaveLength(0)
  })
  it('uses updatedAt as the cancel date when a cancelled subscription has no cancelledAt', () => {
    const s = sub({ status: 'cancelled', updatedAt: new Date('2026-10-10T00:00:00Z') })
    expect(reconstructSnapshotAt('2026-10-09', [s])).toHaveLength(1)
    expect(reconstructSnapshotAt('2026-10-10', [s])).toHaveLength(0)
  })
  it('marks days inside the trial window as trialing, later days as active', () => {
    const s = sub({ trialStart: new Date('2026-10-01T00:00:00Z'), trialEnd: new Date('2026-10-14T00:00:00Z') })
    expect(reconstructSnapshotAt('2026-10-05', [s])[0]!.status).toBe('trialing')
    expect(reconstructSnapshotAt('2026-10-20', [s])[0]!.status).toBe('active')
  })
})

describe('utc-date — the Day-Boundary Rule', () => {
  it('does arithmetic in UTC regardless of process timezone', () => {
    expect(prevDay('2026-03-01')).toBe('2026-02-28')
    expect(addDaysUtc('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysUtc('2026-03-29', 1)).toBe('2026-03-30') // DST changeover in many zones — still 24h in UTC
  })
  it('builds half-open day windows', () => {
    expect(dayStart('2026-11-10').toISOString()).toBe('2026-11-10T00:00:00.000Z')
    expect(dayEndExclusive('2026-11-10').toISOString()).toBe('2026-11-11T00:00:00.000Z')
  })
  it('lists days inclusively and counts gaps', () => {
    expect(eachDay('2026-11-08', '2026-11-10')).toEqual(['2026-11-08', '2026-11-09', '2026-11-10'])
    expect(daysBetween('2026-11-01', '2026-11-10')).toBe(9)
  })
  it('rejects malformed dates', () => expect(() => dayStart('2026-13-45')).toThrow())
})
