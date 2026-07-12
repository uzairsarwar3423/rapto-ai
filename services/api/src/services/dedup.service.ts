import { PlatformType } from '@prisma/client'
import { redis } from '../config/redis'
import * as repo from '../modules/meetings/meetings.repository'
import { logger } from '../config/logger'
import { metrics } from '../config/metrics.config'
import { differenceInSeconds } from 'date-fns'

// ─────────────────────────────────────────────────────────────────────────────
// Deduplication Service — Layer 1 (Redis fast-path) + Layer 2 (DB fallback)
// ─────────────────────────────────────────────────────────────────────────────

export interface ClaimDedupSlotInput {
  teamId: string
  platform: PlatformType | 'MANUAL' | string
  platformMeetingId: string
  scheduledAt: Date
}

export function buildDedupKey(platform: string, platformMeetingId: string): string {
  return `bot:scheduled:${platform.toLowerCase()}:${platformMeetingId}`
}

export function computeDedupTtl(scheduledAt: Date): number {
  // max(3600, secondsUntil(scheduledAt + 4 hours))
  const fourHoursLater = new Date(scheduledAt.getTime() + 4 * 60 * 60 * 1000)
  const secondsUntil = differenceInSeconds(fourHoursLater, new Date())
  return Math.max(3600, secondsUntil)
}

export const dedupService = {
  /**
   * Two-phase atomic claim for a meeting slot.
   * @returns true if DUPLICATE (caller must skip), false if CLAIMED (caller must proceed and confirm/release)
   */
  checkAndClaim: async (input: ClaimDedupSlotInput): Promise<boolean> => {
    const { teamId, platform, platformMeetingId, scheduledAt } = input

    if (platform === 'MANUAL' || !platformMeetingId) {
      return false // MANUAL meetings or un-detectable meetings bypass dedup
    }

    const dedupKey = buildDedupKey(platform, platformMeetingId)
    const ttl = computeDedupTtl(scheduledAt)

    // Layer 1: Atomic Redis Claim (Fast Path)
    // We use SET key value EX ttl NX
    const acquired = await redis.set(dedupKey, 'claiming', 'EX', ttl, 'NX')

    if (!acquired) {
      // Redis rejected the claim — duplicate detected
      metrics.increment('dedup.redis_hit', 1, { platform })
      logger.info({
        event: 'dedup.skip',
        teamId,
        platform,
        platformMeetingId,
        layer: 'redis'
      }, 'Duplicate detected by Redis fast-path')
      return true // DUPLICATE
    }

    // Layer 2: Postgres Fallback (Stale/Evicted Redis Protection)
    const existing = await repo.findActiveByPlatformId(teamId, platform, platformMeetingId)

    if (existing) {
      // Postgres found an existing active meeting — Redis was out of sync.
      // We must RELEASE the false claim we just acquired.
      await redis.del(dedupKey).catch(() => {})
      
      metrics.increment('dedup.postgres_hit_after_redis_miss', 1, { platform })
      logger.info({
        event: 'dedup.skip',
        teamId,
        platform,
        platformMeetingId,
        layer: 'postgres'
      }, 'Duplicate detected by Postgres fallback after Redis miss')
      
      return true // DUPLICATE
    }

    // Claim genuinely succeeded end-to-end
    metrics.increment('dedup.claimed_new', 1, { platform })
    logger.debug({
      event: 'dedup.claimed',
      teamId,
      platform,
      platformMeetingId
    }, 'Slot successfully claimed')

    return false // NOT DUPLICATE (Caller owns the slot)
  },

  /**
   * Confirm a claim after successful meeting creation.
   * Upgrades the placeholder to the real meeting ID.
   */
  confirmClaim: async (platform: string, platformMeetingId: string, meetingId: string): Promise<void> => {
    if (platform === 'MANUAL' || !platformMeetingId) return

    const dedupKey = buildDedupKey(platform, platformMeetingId)
    await redis.set(dedupKey, meetingId, 'KEEPTTL')
  },

  /**
   * Release a claim if meeting creation fails.
   */
  releaseClaim: async (platform: string, platformMeetingId: string): Promise<void> => {
    if (platform === 'MANUAL' || !platformMeetingId) return

    const dedupKey = buildDedupKey(platform, platformMeetingId)
    await redis.del(dedupKey)
    
    logger.info({
      event: 'dedup.released',
      platform,
      platformMeetingId,
      reason: 'creation_failed'
    }, 'Claim released due to failure')
  }
}
