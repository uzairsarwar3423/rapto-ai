import { notificationsService } from '../../src/modules/notifications/notifications.service'
import { redis } from '../../src/config/redis'

describe('Email Rate Limiting Architecture', () => {
  const testUserId = 'test-user-ratelimit-123'
  const dateStr = new Date().toISOString().split('T')[0]
  const key = `ratelimit:email:${testUserId}:${dateStr}`

  afterEach(async () => {
    try {
      await redis.del(key)
    } catch (err) {}
    jest.restoreAllMocks()
  })

  it('allows up to 3 non-exempt email dispatches per user per day', async () => {
    const res1 = await notificationsService.checkAndIncrementEmailRateLimit(testUserId, 'DEADLINE_REMINDER')
    const res2 = await notificationsService.checkAndIncrementEmailRateLimit(testUserId, 'DEADLINE_REMINDER')
    const res3 = await notificationsService.checkAndIncrementEmailRateLimit(testUserId, 'COMMITMENT_MISSED')
    const res4 = await notificationsService.checkAndIncrementEmailRateLimit(testUserId, 'MANAGER_ALERT')

    expect(res1).toBe(true)
    expect(res2).toBe(true)
    expect(res3).toBe(true)
    expect(res4).toBe(false) // 4th email capped out
  })

  it('EXEMPTS MeetingSummary from the daily 3-email rate limit cap', async () => {
    // Fill up 3 sends
    await notificationsService.checkAndIncrementEmailRateLimit(testUserId, 'DEADLINE_REMINDER')
    await notificationsService.checkAndIncrementEmailRateLimit(testUserId, 'DEADLINE_REMINDER')
    await notificationsService.checkAndIncrementEmailRateLimit(testUserId, 'DEADLINE_REMINDER')

    // 4th non-exempt email is blocked
    const nonExempt = await notificationsService.checkAndIncrementEmailRateLimit(testUserId, 'DEADLINE_REMINDER')
    expect(nonExempt).toBe(false)

    // MeetingSummary email STILL succeeds despite maxed out cap
    const meetingSummaryAllowed = await notificationsService.checkAndIncrementEmailRateLimit(testUserId, 'MEETING_PROCESSED')
    expect(meetingSummaryAllowed).toBe(true)
  })
})
