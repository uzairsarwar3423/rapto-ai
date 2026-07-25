import { generateUnsubscribeToken, verifyUnsubscribeToken } from '../../src/modules/notifications/unsubscribe.utils'
import { notificationsService } from '../../src/modules/notifications/notifications.service'
import { renderEmailFooter } from '../../src/modules/notifications/templates/shared/EmailFooter'

describe('Type-Scoped Unsubscribe Token & Header Suite', () => {
  const userId = 'user-unsub-test-456'

  it('generates and verifies signed type-scoped unsubscribe tokens', () => {
    const notificationType = 'DEADLINE_REMINDER'
    const token = generateUnsubscribeToken(userId, notificationType)

    expect(token).toBeDefined()
    expect(typeof token).toBe('string')

    const decoded = verifyUnsubscribeToken(token)
    expect(decoded).not.toBeNull()
    expect(decoded?.userId).toBe(userId)
    expect(decoded?.notificationType).toBe(notificationType)
  })

  it('rejects tampered or malformed unsubscribe tokens', () => {
    const badToken = 'invalid-base64-string!!!'
    const decoded = verifyUnsubscribeToken(badToken)
    expect(decoded).toBeNull()
  })

  it('renderEmailFooter includes type-scoped unsubscribe token link', () => {
    const token = generateUnsubscribeToken(userId, 'COMMITMENT_MISSED')
    const footerHtml = renderEmailFooter({
      notificationType: 'COMMITMENT_MISSED',
      unsubscribeToken: token,
    })

    expect(footerHtml).toContain('/unsubscribe?token=')
    expect(footerHtml).toContain('Unsubscribe or change preferences')
  })

  it('unsubscribeType disables only the specific notification type preference', async () => {
    jest.spyOn(notificationsService, 'updatePreferences').mockImplementation(async (_uId, partial) => {
      return {
        email: {
          meetingSummary: true,
          commitmentMissed: true,
          deadlineReminder: false,
          commitmentFulfilled: true,
          weeklyDigest: true,
          ...partial.email,
        },
        slack: {
          meetingSummary: true,
          commitmentMissed: true,
          deadlineReminder: true,
          commitmentFulfilled: true,
          dailyDigest: true,
        },
        inApp: {
          meetingSummary: true,
          commitmentMissed: true,
          deadlineReminder: true,
          commitmentFulfilled: true,
        },
      }
    })

    const updated = await notificationsService.unsubscribeType(userId, 'DEADLINE_REMINDER')

    expect(notificationsService.updatePreferences).toHaveBeenCalledWith(userId, {
      email: {
        deadlineReminder: false,
      },
    })
    expect(updated.email.deadlineReminder).toBe(false)
  })
})
