import { Emitter } from '@socket.io/redis-emitter'
import Redis from 'ioredis'
import { logger } from '../config/logger'

/**
 * Same Docker-aware host resolution used by redis.ts and socket.server.ts.
 * Rejects localhost/127.0.0.1 and falls back to 'rapto-redis'.
 */
function makeEmitterRedisClient(): Redis {
    const isLocalhost = (h: string) =>
        h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === ''

    const retryStrategy = (times: number) => Math.min(times * 100, 3000)

    if (process.env.REDIS_HOST && !isLocalhost(process.env.REDIS_HOST)) {
        return new Redis({
            host: process.env.REDIS_HOST,
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
            password: process.env.REDIS_PASSWORD || undefined,
            retryStrategy,
        })
    }

    const url = process.env.REDIS_URL
    if (url) {
        try {
            const u = new URL(url)
            if (!isLocalhost(u.hostname)) {
                return new Redis({
                    host: u.hostname,
                    port: u.port ? parseInt(u.port, 10) : 6379,
                    password: decodeURIComponent(u.password) || undefined,
                    retryStrategy,
                })
            }
        } catch {}
    }

    logger.warn('socket.emitter: falling back to rapto-redis (REDIS_URL not set or is localhost)')
    return new Redis({ host: 'rapto-redis', port: 6379, retryStrategy })
}

const redisClient = makeEmitterRedisClient()

redisClient.on('error', (err) => logger.error({ err }, 'socket.emitter: Redis client error'))

export const socketEmitter = new Emitter(redisClient)
