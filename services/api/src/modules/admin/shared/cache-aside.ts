import { redis } from '../../../config/redis'
import { logger } from '../../../config/logger'

/**
 * Read-through cache for admin endpoints.
 *
 * Resilient by design: if Redis is down, slow, or returns garbage, the request is served from `compute()` — a cache
 * outage degrades latency, never availability or correctness.
 *
 * KEY PREFIXES (lifecycle matters — the rollup worker SCANs and clears `cache:admin:dashboard:*` after every run):
 *   cache:admin:dashboard:*   cleared whenever metrics are rolled up
 *   cache:admin:users:*       NOT cleared by the rollup (different lifecycle — short TTL only)
 */
export async function cacheAside<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
  try {
    const hit = await redis.get(key)
    if (hit) return JSON.parse(hit) as T
  } catch (err: any) {
    logger.warn({ key, err: err?.message }, 'admin cache read failed — computing directly')
  }

  const value = await compute()

  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value))
  } catch (err: any) {
    logger.warn({ key, err: err?.message }, 'admin cache write failed')
  }

  return value
}
