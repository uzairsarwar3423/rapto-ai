/**
 * redis.config.ts — Single Source of Truth for Redis Connection Options
 *
 * PROBLEM THIS SOLVES:
 *   Previously every Redis client in the codebase (redis.ts, queue.client.ts,
 *   socket.server.ts, socket.emitter.ts, notify.worker.ts) duplicated the same
 *   "Docker-aware hostname resolution" logic independently. Any drift between copies
 *   caused subtle bugs where one client resolved correctly while another fell back to
 *   'rapto-redis' — causing EAI_AGAIN when running outside Docker.
 *
 * RESOLUTION PRIORITY (strictly enforced, single location):
 *   1. REDIS_HOST env var  — explicit, injected by docker-compose or .env
 *   2. Hostname from REDIS_URL — only accepted if NOT localhost / 127.0.0.1 / ::1
 *   3. '127.0.0.1'         — safe local dev fallback (never 'rapto-redis' outside Docker)
 *
 * WHY NOT 'rapto-redis' AS FALLBACK:
 *   'rapto-redis' is a Docker Compose service name — only resolvable inside the
 *   Docker network. Running the process directly on the host triggers EAI_AGAIN
 *   because 'rapto-redis' does not exist in the host DNS or /etc/hosts.
 *   In docker-compose, REDIS_HOST=rapto-redis is set explicitly in the environment
 *   block, so the Priority 1 branch handles it — no fallback needed.
 *
 * USAGE:
 *   import { redisConnectionOptions, makeRedisClient } from './redis.config'
 *
 *   // For BullMQ (plain object):
 *   const queue = new Queue('myQueue', { connection: redisConnectionOptions })
 *
 *   // For ioredis instances:
 *   const client = makeRedisClient({ lazyConnect: true })
 */

import Redis, { RedisOptions } from 'ioredis'

export interface RedisConnectionOptions {
  host: string
  port: number
  password?: string
}

/**
 * Resolves Redis connection options from environment variables.
 * Called once at module load — result is memoized as `redisConnectionOptions`.
 */
function resolveRedisOptions(): RedisConnectionOptions {
  const isLocalhost = (h: string): boolean =>
    h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === ''

  // ── Priority 1: REDIS_HOST explicitly set ───────────────────────────────────
  const envHost = process.env.REDIS_HOST
  if (envHost && !isLocalhost(envHost)) {
    return {
      host: envHost,
      port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
    }
  }

  // ── Priority 2: Parse REDIS_URL, reject localhost ───────────────────────────
  const redisUrl = process.env.REDIS_URL
  if (redisUrl) {
    try {
      const u = new URL(redisUrl)
      if (!isLocalhost(u.hostname)) {
        return {
          host: u.hostname,
          port: u.port ? parseInt(u.port, 10) : 6379,
          password: u.password ? decodeURIComponent(u.password) : undefined,
        }
      }
    } catch {
      // Malformed REDIS_URL — fall through to local default
    }
  }

  // ── Priority 3: Safe local dev fallback ─────────────────────────────────────
  // 127.0.0.1 resolves on any host. Do NOT use 'rapto-redis' here —
  // that name only resolves inside the Docker Compose network.
  // In docker-compose, REDIS_HOST=rapto-redis is set explicitly (Priority 1).
  return {
    host: '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  }
}

/**
 * Resolved once at startup. Shared by all Redis consumers in the app.
 * Never mutated after resolution.
 */
export const redisConnectionOptions: RedisConnectionOptions = resolveRedisOptions()

// Log once so every service startup clearly shows what was resolved
console.log(
  `🔧 Redis resolved → ${redisConnectionOptions.host}:${redisConnectionOptions.port}` +
  (redisConnectionOptions.password ? ' (password set)' : ' (no password)')
)

/**
 * Factory: create an ioredis Redis instance using the resolved options.
 * Accepts optional overrides (e.g. lazyConnect, maxRetriesPerRequest).
 *
 * @param overrides - ioredis constructor options to merge on top of base options.
 */
export function makeRedisClient(overrides: Partial<RedisOptions> = {}): Redis {
  return new Redis({
    host: redisConnectionOptions.host,
    port: redisConnectionOptions.port,
    password: redisConnectionOptions.password,
    retryStrategy: (times: number) => Math.min(times * 200, 5000),
    ...overrides,
  })
}
