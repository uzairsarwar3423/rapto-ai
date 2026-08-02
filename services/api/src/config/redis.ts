/**
 * redis.ts — Primary ioredis singleton for the application.
 *
 * Connection options are resolved once from redis.config.ts (single source of truth).
 * lazyConnect: true — no TCP connection is made until redis.connect() is called in server.ts.
 */
import { makeRedisClient, redisConnectionOptions } from './redis.config'

export const redis = makeRedisClient({
    lazyConnect: true,
    maxRetriesPerRequest: 3,
})

redis.on('error', (err) => {
    // Non-fatal — ioredis retryStrategy will reconnect automatically.
    // The one-time ⚠️ in redis.config.ts already logged the resolved host.
    console.error(
        `⚠️  Redis error [${redisConnectionOptions.host}:${redisConnectionOptions.port}]:`,
        err.message
    )
})