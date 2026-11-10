/**
 * Service-level tests with an in-memory fake repository — they prove orchestration invariants
 * (idempotency, zero-guard, replace-not-append) without touching any real database.
 */
import type { DailyMetricsRow } from '../../../src/modules/admin/metrics/metrics-row-builder'

type SnapRow = { teamId: string; plan: string; amountCents: number; status: string }

const store = {
  live: [] as Array<{ teamId: string; plan: string; status: string; unitAmountCents: number | null; billingInterval: string | null }>,
  snapshots: new Map<string, SnapRow[]>(),
  metrics: new Map<string, DailyMetricsRow>(),
  upserts: 0,
}

jest.mock('../../../src/modules/admin/metrics/metrics-rollup.repository', () => ({
  metricsRollupRepository: {
    readLiveSubscriptions: jest.fn(async () => store.live),
    replaceSnapshot: jest.fn(async (date: string, rows: SnapRow[]) => {
      store.snapshots.set(date, rows) // replace, never append
    }),
    readSnapshot: jest.fn(async (date: string) => store.snapshots.get(date) ?? []),
    hasSnapshot: jest.fn(async (date: string) => (store.snapshots.get(date)?.length ?? 0) > 0),
    sumRevenueForDay: jest.fn(async () => 700n),
    sumRevenueThrough: jest.fn(async () => 9_000n),
    countNewTeams: jest.fn(async () => 1),
    countTeamsThrough: jest.fn(async () => 5),
    countUsersThrough: jest.fn(async () => 20),
    upsertDailyMetric: jest.fn(async (row: DailyMetricsRow) => {
      store.upserts++
      store.metrics.set(row.date.toISOString().slice(0, 10), row)
    }),
  },
}))
jest.mock('../../../src/config/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))

import { metricsRollupService } from '../../../src/modules/admin/metrics/metrics-rollup.service'
import { logger } from '../../../src/config/logger'

const TODAY = '2026-11-10'
const YESTERDAY = '2026-11-09'

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(`${TODAY}T12:00:00Z`))
  store.live = [
    { teamId: 'a', plan: 'GROWTH', status: 'active', unitAmountCents: 10_000, billingInterval: 'month' },
    { teamId: 'b', plan: 'BUSINESS', status: 'active', unitAmountCents: 120_000, billingInterval: 'year' }, // → 10_000/mo
    { teamId: 'c', plan: 'STARTER', status: 'trialing', unitAmountCents: 3_000, billingInterval: 'month' },
  ]
  store.snapshots.clear()
  store.metrics.clear()
  store.upserts = 0
  jest.clearAllMocks()
})
afterEach(() => jest.useRealTimers())

describe('captureTodaySnapshot', () => {
  it('replaces rather than appends (row count stable across 3 runs)', async () => {
    for (let i = 0; i < 3; i++) await metricsRollupService.captureTodaySnapshot()
    expect(store.snapshots.get(TODAY)).toHaveLength(3)
  })
  it('normalizes annual plans to monthly', async () => {
    await metricsRollupService.captureTodaySnapshot()
    expect(store.snapshots.get(TODAY)!.find((r) => r.teamId === 'b')!.amountCents).toBe(10_000)
  })
})

describe('computeDay', () => {
  it('is idempotent — running twice yields an identical row', async () => {
    await metricsRollupService.captureTodaySnapshot()
    const first = await metricsRollupService.computeDay(TODAY)
    const second = await metricsRollupService.computeDay(TODAY)
    expect(second).toEqual(first)
    expect(store.metrics.size).toBe(1) // upsert, not insert
  })

  it('refuses to write a zeroed row when live subscriptions exist but the snapshot is empty', async () => {
    await expect(metricsRollupService.computeDay(TODAY)).rejects.toThrow(/refusing to write a zeroed row/)
    expect(store.upserts).toBe(0)
  })

  it('writes a legitimate zero row when there are genuinely no subscriptions', async () => {
    store.live = []
    const row = await metricsRollupService.computeDay(TODAY)
    expect(row.mrrCents).toBe(0n)
    expect(store.upserts).toBe(1)
  })

  it('records NO movement (not a fake all-new spike) when the previous-day snapshot is missing', async () => {
    await metricsRollupService.captureTodaySnapshot()
    const row = await metricsRollupService.computeDay(TODAY)
    expect(row.newMrrCents).toBe(0n)
    expect(row.churnedMrrCents).toBe(0n)
    expect(logger.warn).toHaveBeenCalled()
  })

  it('computes real expansion/contraction/churn from two stored snapshots', async () => {
    store.snapshots.set(YESTERDAY, [
      { teamId: 'a', plan: 'GROWTH', amountCents: 8_000, status: 'active' }, // a expands 8k → 10k
      { teamId: 'z', plan: 'STARTER', amountCents: 4_000, status: 'active' }, // z disappears → churn
    ])
    await metricsRollupService.captureTodaySnapshot()
    const row = await metricsRollupService.computeDay(TODAY)
    expect(row.expansionMrrCents).toBe(2_000n)
    expect(row.churnedMrrCents).toBe(4_000n)
    expect(row.newMrrCents).toBe(10_000n) // b is new and paying; c is only trialing
    expect(row.dailyRevenueCents).toBe(700n)
    expect(row.totalRevenueCents).toBe(9_000n)
  })
})

describe('finalizeNightly', () => {
  it('finalizes yesterday from its STORED snapshot, not from live state', async () => {
    store.snapshots.set(YESTERDAY, [{ teamId: 'a', plan: 'GROWTH', amountCents: 5_000, status: 'active' }])
    const result = await metricsRollupService.finalizeNightly()
    expect(result).toEqual({ finalized: YESTERDAY, opened: TODAY })
    expect(store.metrics.get(YESTERDAY)!.mrrCents).toBe(5_000n) // yesterday's snapshot, not today's live MRR
    expect(store.metrics.get(TODAY)!.mrrCents).toBe(20_000n)
  })

  it('skips finalizing a day with no snapshot (loud error), but still opens today', async () => {
    const result = await metricsRollupService.finalizeNightly()
    expect(result.finalized).toBeNull()
    expect(store.metrics.has(YESTERDAY)).toBe(false)
    expect(store.metrics.has(TODAY)).toBe(true)
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ alert: 'metrics.rollup_missing_snapshot' }), expect.any(String))
  })

  it('triggers the cohort hook on the first of the month', async () => {
    jest.setSystemTime(new Date('2026-12-01T00:15:00Z'))
    const spy = jest.spyOn(metricsRollupService, 'recomputeCohortRetention')
    await metricsRollupService.finalizeNightly()
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
