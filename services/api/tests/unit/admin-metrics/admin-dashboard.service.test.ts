const metric = (over: Record<string, unknown> = {}) => ({
  date: new Date('2026-11-01T00:00:00Z'),
  dailyRevenueCents: 100n,
  totalRevenueCents: 1_000n,
  mrrCents: 10_000n,
  arrCents: 120_000n,
  newMrrCents: 0n,
  expansionMrrCents: 0n,
  contractionMrrCents: 0n,
  churnedMrrCents: 0n,
  activeSubscriptions: 10,
  newTeams: 0,
  churnedTeams: 0,
  totalTeams: 10,
  totalUsers: 40,
  arpuCents: 1_000,
  logoChurnRate: 0,
  revenueChurnRate: 0,
  computedAt: new Date('2026-11-10T00:15:00Z'),
  ...over,
})

const repo = {
  findMetricAt: jest.fn(),
  findMetricsInRange: jest.fn(),
  findLatestMetricMeta: jest.fn(),
}
jest.mock('../../../src/modules/admin/dashboard/admin-dashboard.repository', () => ({ adminDashboardRepository: repo }))
jest.mock('../../../src/config/redis', () => ({ redis: { get: jest.fn(async () => null), setex: jest.fn(async () => 'OK') } }))

import { adminDashboardService, computeDelta, previousPeriod } from '../../../src/modules/admin/dashboard/admin-dashboard.service'

beforeEach(() => jest.clearAllMocks())

describe('previousPeriod', () => {
  it('returns the equal-length window ending the day before `from`', () => {
    expect(previousPeriod('2026-11-04', '2026-11-10')).toEqual({ from: '2026-10-28', to: '2026-11-03' }) // 7 days
    expect(previousPeriod('2026-11-10', '2026-11-10')).toEqual({ from: '2026-11-09', to: '2026-11-09' }) // 1 day
  })
})

describe('computeDelta', () => {
  it('guards division by zero', () => expect(computeDelta(0, 50)).toEqual({ value: 50, deltaPct: 0, direction: 'up' }))
  it('reports direction and an absolute rounded delta', () => {
    expect(computeDelta(200, 150)).toEqual({ value: 150, deltaPct: 25, direction: 'down' })
  })
})

describe('getRevenueTrend (C1)', () => {
  it('reads the PER-DAY column and a weekly bucket equals the sum of its days', async () => {
    const days = Array.from({ length: 7 }, (_, i) =>
      metric({ date: new Date(Date.UTC(2026, 10, 2 + i)), dailyRevenueCents: BigInt((i + 1) * 100), totalRevenueCents: BigInt(99_999) }),
    )
    repo.findMetricsInRange.mockResolvedValue(days)
    const { points } = await adminDashboardService.getRevenueTrend('2026-11-02', '2026-11-08', 'week')
    const total = points.reduce((s, p) => s + p.value, 0)
    expect(total).toBe(100 + 200 + 300 + 400 + 500 + 600 + 700) // NOT the cumulative column
  })
})

describe('getOverview (C1 + C2)', () => {
  function arrange(opts: { cur: unknown[]; prev: unknown[]; startMrr?: bigint; prevStartMrr?: bigint; latest?: unknown }) {
    repo.findMetricAt.mockImplementation(async (d: string) =>
      d === '2026-11-04' ? metric({ mrrCents: opts.startMrr ?? 10_000n }) : d === '2026-10-28' ? metric({ mrrCents: opts.prevStartMrr ?? 10_000n }) : metric(),
    )
    repo.findMetricsInRange.mockImplementation(async (from: string) => (from === '2026-11-04' ? opts.cur : opts.prev))
    repo.findLatestMetricMeta.mockResolvedValue(
      'latest' in opts ? opts.latest : { date: new Date('2026-11-10T00:00:00Z'), computedAt: new Date('2026-11-10T00:15:00Z') },
    )
  }

  it('Total Revenue = revenue collected in the range vs the previous equal-length range', async () => {
    arrange({ cur: [metric({ dailyRevenueCents: 300n }), metric({ dailyRevenueCents: 300n })], prev: [metric({ dailyRevenueCents: 400n })] })
    const o = await adminDashboardService.getOverview('2026-11-04', '2026-11-10')
    expect(o.totalRevenue).toEqual({ value: 600, deltaPct: 50, direction: 'up' })
  })

  it('revenueChurn = Σ churned MRR ÷ MRR at period start; rising churn is reported as direction "up"', async () => {
    arrange({
      cur: [metric({ churnedMrrCents: 500n }), metric({ churnedMrrCents: 500n })], // 1000 / 10000 = 10%
      prev: [metric({ churnedMrrCents: 500n })], // 500 / 10000 = 5%
    })
    const o = await adminDashboardService.getOverview('2026-11-04', '2026-11-10')
    expect(o.revenueChurn).toEqual({ value: 10, deltaPct: 100, direction: 'up' })
  })

  it('returns freshness meta from the newest row', async () => {
    arrange({ cur: [metric()], prev: [metric()] })
    const o = await adminDashboardService.getOverview('2026-11-04', '2026-11-10')
    expect(o.meta).toEqual({ asOf: '2026-11-10', computedAt: '2026-11-10T00:15:00.000Z' })
  })

  it('returns null meta (not a crash) when the metrics table is empty', async () => {
    arrange({ cur: [], prev: [], latest: null })
    const o = await adminDashboardService.getOverview('2026-11-04', '2026-11-10')
    expect(o.meta).toEqual({ asOf: null, computedAt: null })
    expect(o.revenueChurn.value).toBe(0)
  })
})
