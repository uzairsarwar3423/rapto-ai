import Redis from 'ioredis'

/**
 * Parse REDIS_URL into explicit ioredis options so the resolved hostname
 * is visible in logs and `REDIS_HOST` env var from docker-compose can
 * override it without needing a full URL rewrite.
 *
 * Priority order:
 *   1. REDIS_HOST + REDIS_PORT env vars (injected by docker-compose)
 *   2. Hostname parsed from REDIS_URL
 *   3. Hard default 'rapto-redis' (Docker Compose service name)
 */
function buildRedisOptions() {
    // Prefer explicit host/port from docker-compose environment section
    const envHost = process.env.REDIS_HOST
    const envPort = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : undefined
    const envPassword = process.env.REDIS_PASSWORD || undefined

    if (envHost) {
        return {
            host: envHost,
            port: envPort ?? 6379,
            password: envPassword,
        }
    }

    // Parse from REDIS_URL
    const url = process.env.REDIS_URL
    if (url) {
        try {
            const u = new URL(url)
            const host = u.hostname || 'rapto-redis'
            const port = u.port ? parseInt(u.port, 10) : 6379
            const password = u.password || undefined
            return { host, port, password }
        } catch (e) {
            console.warn('⚠️ Failed to parse REDIS_URL, falling back to rapto-redis:', e)
        }
    }

    // Ultimate fallback — Docker Compose service name
    return { host: 'rapto-redis', port: 6379, password: undefined }
}

const opts = buildRedisOptions()

console.log(`🔧 Redis config resolved → host: ${opts.host}, port: ${opts.port}`)

export const redis = new Redis({
    ...opts,
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 50, 2000),
})

redis.on('error', (err) => {
    console.error(`Redis error (${opts.host}:${opts.port}):`, err.message)
})