import { bucketByGranularity } from '../../src/modules/admin/dashboard/bucket-by-granularity'

describe('bucketByGranularity', () => {
  it('returns points unchanged for granularity="day"', () => {
    const input = [
      { date: '2026-09-01', value: 100 },
      { date: '2026-09-02', value: 200 },
    ]
    expect(bucketByGranularity(input, 'day')).toEqual(input)
  })

  it('sums daily values into weekly buckets for revenue-style metrics', () => {
    const input = [
      { date: '2026-09-07', value: 100 }, // Monday
      { date: '2026-09-08', value: 100 }, // Tuesday, same week
    ]
    const result = bucketByGranularity(input, 'week', 'sum')
    expect(result).toHaveLength(1)
    expect(result[0].value).toBe(200)
  })

  it('averages daily values into monthly buckets for ARPU-style metrics', () => {
    const input = [
      { date: '2026-09-01', value: 100 },
      { date: '2026-09-02', value: 300 },
    ]
    const result = bucketByGranularity(input, 'month', 'average')
    expect(result[0].value).toBe(200)
  })
})
