import Redis from 'ioredis'

/**
 * Resolve Redis connection options with strict Docker-aware priority:
 *
 *  1. REDIS_HOST env var (explicitly injected by docker-compose — most reliable)
 *  2. Hostname parsed from REDIS_URL, BUT only if it is NOT localhost/127.0.0.1
 *  3. Hard fallback → 'rapto-redis'  (Docker Compose service name, always reachable)
 *
 * Never passes REDIS_URL raw to ioredis — raw URL silently resolves 'localhost'
 * inside the container to the container's own loopback, not the Redis service.
 */
function buildRedisOptions(): {
    host: string
    port: number
    password?: string
    lazyConnect: true
    maxRetriesPerRequest: number
    retryStrategy: (times: number) => number
} {
    const base = {
        lazyConnect: true as const,
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => Math.min(times * 100, 3000),
    }

    // ── Priority 1: explicit REDIS_HOST from docker-compose ──────────────────
    if (process.env.REDIS_HOST && !isLocalhost(process.env.REDIS_HOST)) {
        return {
            ...base,
            host: process.env.REDIS_HOST,
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
            password: process.env.REDIS_PASSWORD || undefined,
        }
    }

    // ── Priority 2: parse REDIS_URL, reject localhost ─────────────────────────
    const url = process.env.REDIS_URL
    if (url) {
        try {
            const u = new URL(url)
            if (!isLocalhost(u.hostname)) {
                return {
                    ...base,
                    host: u.hostname,
                    port: u.port ? parseInt(u.port, 10) : 6379,
                    password: decodeURIComponent(u.password) || undefined,
                }
            }
        } catch {}
    }

    // ── Priority 3: hard fallback — always correct inside Docker ─────────────
    return { ...base, host: 'rapto-redis', port: 6379 }
}

function isLocalhost(h: string): boolean {
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === ''
}

const opts = buildRedisOptions()

console.log(`🔧 Redis resolved → ${opts.host}:${opts.port} (lazyConnect — no TCP until .connect())`)

export const redis = new Redis(opts)

redis.on('error', (err) => {
    // Non-fatal — retryStrategy will reconnect automatically
    console.error(`⚠️  Redis error [${opts.host}:${opts.port}]:`, err.message)
})