import { redis } from '../config/redis'

export class DedupService {
    // 24 hours in seconds
    private static DEFAULT_TTL = 24 * 60 * 60

    private buildKey(platform: string, platformMeetingId: string): string {
        return `bot:scheduled:${platform}:${platformMeetingId}`
    }

    /**
     * Checks if a meeting is already claimed/scheduled.
     * Returns true if it is a duplicate (skip).
     * Returns false if it successfully claimed it (proceed).
     */
    public async checkAndClaim(params: { teamId: string; platform: string; platformMeetingId: string; scheduledAt: Date }): Promise<boolean> {
        const key = this.buildKey(params.platform, params.platformMeetingId)
        
        // Use SET NX to atomically check and claim
        const acquired = await redis.set(key, 'pending', 'EX', DedupService.DEFAULT_TTL, 'NX')
        
        // If acquired is null, someone else already holds the lock/claim -> it's a duplicate
        return acquired === null
    }

    /**
     * Confirms a claim by updating the placeholder value with the actual meeting ID.
     */
    public async confirmClaim(platform: string, platformMeetingId: string, meetingId: string): Promise<void> {
        const key = this.buildKey(platform, platformMeetingId)
        // Overwrite the 'pending' with the real meetingId, keep TTL
        await redis.set(key, meetingId, 'EX', DedupService.DEFAULT_TTL)
    }

    /**
     * Releases a claim so the slot is immediately available for retry.
     */
    public async releaseClaim(platform: string, platformMeetingId: string): Promise<void> {
        const key = this.buildKey(platform, platformMeetingId)
        await redis.del(key)
    }
}

export const dedupService = new DedupService()
