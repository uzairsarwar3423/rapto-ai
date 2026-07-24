import { slackNotifyService } from '../../src/modules/notifications/slack-notify.service'
import { slackProvider } from '../../src/modules/integrations/providers/slack.provider'
import { notificationsService } from '../../src/modules/notifications/notifications.service'
import type { TeamIntegration } from '@prisma/client'

describe('Cross-Channel Failure Isolation', () => {
  const mockIntegration: TeamIntegration = {
    id: 'integ-slack-isolation',
    teamId: 'team-isolation-1',
    provider: 'SLACK',
    accessTokenEnc: 'enc-bot-token',
    refreshTokenEnc: null,
    tokenExpiresAt: null,
    workspaceId: 'T99999',
    workspaceName: 'Acme Test',
    workspaceUrl: 'https://acme.slack.com',
    metadata: { defaultChannelId: 'C99999' },
    isActive: true,
    lastSyncedAt: null,
    lastError: null,
    consecutiveErrors: 0,
    connectedById: null,
    disconnectedById: null,
    disconnectedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('continues manager fan-out when a single manager send throws an unexpected network error', async () => {
    jest.spyOn(notificationsService, 'getManagersToNotify').mockResolvedValue([
      { id: 'mgr-bad', email: 'unreachable@acme.com', name: 'Bad Manager' },
      { id: 'mgr-good', email: 'reachable@acme.com', name: 'Good Manager' },
    ])
    jest.spyOn(notificationsService, 'shouldSendSlack').mockResolvedValue(true)
    jest.spyOn(notificationsService, 'checkAndSetDedup').mockResolvedValue(true)

    // Mock sendDirectMessage to throw on mgr-bad and succeed on mgr-good
    jest.spyOn(slackProvider, 'sendDirectMessage').mockImplementation(async (_integ, email) => {
      if (email === 'unreachable@acme.com') {
        throw new Error('Slack API 500 Internal Server Error')
      }
      return { ok: true, ts: '1700000001.000100', channel: 'D-good' }
    })

    const commitment = {
      id: 'comm-isolation-test',
      text: 'Deploy hotfix',
      ownerName: 'Grace',
      ownerId: 'user-grace',
    }

    const result = await slackNotifyService.sendManagerAlerts(
      commitment,
      'team-isolation-1',
      mockIntegration,
      0
    )

    // One failed, one sent — whole loop completed cleanly without throwing
    expect(result.sent).toBe(1)
    expect(result.failed).toBe(1)
  })

  it('safely handles SLACK_USER_NOT_FOUND response without propagating exception', async () => {
    jest.spyOn(slackProvider, 'sendDirectMessage').mockResolvedValue({
      ok: false,
      error: 'SLACK_USER_NOT_FOUND',
    })

    const res = await slackNotifyService.sendCommitmentMissedOwner(
      mockIntegration,
      'nonexistent@acme.com',
      {
        id: 'comm-unresolved',
        text: 'Task with unresolved Slack user',
        actionUrl: 'http://localhost:3000/commitments/comm-unresolved',
      }
    )

    expect(res.ok).toBe(false)
    expect(res.error).toBe('SLACK_USER_NOT_FOUND')
  })
})
