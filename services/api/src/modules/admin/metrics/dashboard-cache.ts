import { redis } from '../../../config/redis'

export const DASHBOARD_CACHE_PATTERN = 'cache:admin:dashboard:*'

/**
 * Drop every cached dashboard response so the dashboard never shows numbers older than the last rollup.
 * SCAN + UNLINK, never KEYS: KEYS blocks Redis for the whole keyspace and is banned on production paths.
 * Shared by the rollup worker and the backfill script.
 */
export async function invalidateDashboardCache(): Promise<number> {
  let removed = 0
  const stream = redis.scanStream({ match: DASHBOARD_CACHE_PATTERN, count: 100 })
  for await (const keys of stream as AsyncIterable<string[]>) {
    if (keys.length) {
      await redis.unlink(...keys)
      removed += keys.length
    }
  }
  return removed
}
