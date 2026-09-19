import type { Granularity } from './admin-dashboard.types'
import { format, startOfWeek, startOfMonth } from 'date-fns'

interface DailyPoint {
  date: string
  value: number
}

export function bucketByGranularity(
  points: DailyPoint[],
  granularity: Granularity,
  aggregation: 'sum' | 'average' = 'sum'
): DailyPoint[] {
  if (granularity === 'day') return points

  const groups = new Map<string, number[]>()
  for (const point of points) {
    const d = new Date(point.date + 'T00:00:00')
    const bucketKey =
      granularity === 'week'
        ? format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
        : format(startOfMonth(d), 'yyyy-MM-dd')
    if (!groups.has(bucketKey)) groups.set(bucketKey, [])
    groups.get(bucketKey)!.push(point.value)
  }

  return [...groups.entries()].map(([date, values]) => ({
    date,
    value:
      aggregation === 'sum'
        ? values.reduce((a, b) => a + b, 0)
        : Math.round(values.reduce((a, b) => a + b, 0) / values.length),
  }))
}
