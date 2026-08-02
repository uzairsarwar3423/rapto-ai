/**
 * socket.emitter.ts — Redis Emitter for cross-process Socket.io event broadcasting.
 *
 * Uses makeRedisClient() from redis.config.ts (single source of truth for
 * Redis connection options) instead of duplicating hostname resolution logic.
 */
import { Emitter } from '@socket.io/redis-emitter'
import { makeRedisClient } from '../config/redis.config'
import { logger } from '../config/logger'

const redisClient = makeRedisClient()

redisClient.on('error', (err) => logger.error({ err }, 'socket.emitter: Redis client error'))

export const socketEmitter = new Emitter(redisClient)

