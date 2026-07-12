// @ts-nocheck
import { dedupService, computeDedupTtl } from '../../services/dedup.service'
import { redis } from '../../config/redis'
import * as repo from '../../modules/meetings/meetings.repository'
import { differenceInSeconds } from 'date-fns'

jest.mock('../../config/redis', () => ({
  redis: {
    set: jest.fn(),
    del: jest.fn(),
  }
}))

jest.mock('../../modules/meetings/meetings.repository', () => ({
  findActiveByPlatformId: jest.fn(),
}))

jest.mock('../../config/metrics.config', () => ({
  metrics: {
    increment: jest.fn(),
  }
}))

jest.mock('../../config/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  }
}))

describe('Dedup Service', () => {
  const teamId = 'team-123'
  const platform = 'ZOOM'
  const platformMeetingId = 'zoom-123'
  const scheduledAt = new Date()

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('handles concurrency via Redis SET NX', async () => {
    let callCount = 0
    ;(redis.set as jest.Mock).mockImplementation(async () => {
      callCount++
      return callCount === 1 ? 'OK' : null
    })

    const promises = Array.from({ length: 10 }).map(() =>
      dedupService.checkAndClaim({ teamId, platform, platformMeetingId, scheduledAt })
    )

    const results = await Promise.all(promises)
    const claimedCount = results.filter(r => r === false).length
    const duplicateCount = results.filter(r => r === true).length

    expect(claimedCount).toBe(1)
    expect(duplicateCount).toBe(9)
  })

  it('computes correct TTL with floor of 3600', () => {
    const nearFuture = new Date(Date.now() + 30 * 60 * 1000)
    const ttl = computeDedupTtl(nearFuture)
    expect(ttl).toBeGreaterThanOrEqual(3600)
  })

  it('falls back to Postgres if Redis is stale', async () => {
    ;(redis.set as jest.Mock).mockResolvedValue('OK')
    ;(repo.findActiveByPlatformId as jest.Mock).mockResolvedValue({ id: 'existing-meeting' })

    const result = await dedupService.checkAndClaim({ teamId, platform, platformMeetingId, scheduledAt })
    
    expect(result).toBe(true)
    expect(redis.del).toHaveBeenCalled()
  })

  it('bypasses dedup for MANUAL platform', async () => {
    const result = await dedupService.checkAndClaim({ teamId, platform: 'MANUAL', platformMeetingId, scheduledAt })
    expect(result).toBe(false)
    expect(redis.set).not.toHaveBeenCalled()
  })
})
