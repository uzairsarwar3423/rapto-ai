import { slackNotifyService } from '../../src/modules/notifications/slack-notify.service'
import { slackProvider } from '../../src/modules/integrations/providers/slack.provider'
import { notificationsService } from '../../src/modules/notifications/notifications.service'
import type { TeamIntegration } from '@prisma/client'

describe('Slack Notifications Integration & Fan-Out Orchestration', () => {
  const mockIntegration: TeamIntegration = {
    id: 'integ-slack-test',
    teamId: 'team-slack-integ-1',
    provider: 'SLACK',
    accessTokenEnc: 'enc-bot-token',
    refreshTokenEnc: null,
    tokenExpiresAt: null,
    workspaceId: 'T12345',
    workspaceName: 'Acme Workspace',
    workspaceUrl: 'https://acme.slack.com',
    metadata: { defaultChannelId: 'C12345' },
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

  let sendDirectMessageSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    sendDirectMessageSpy = jest
      .spyOn(slackProvider, 'sendDirectMessage')
      .mockResolvedValue({ ok: true, ts: '1700000000.000100', channel: 'D12345' })
  })

  afterEach(() => {
    sendDirectMessageSpy.mockRestore()
  })

  it('dispatches owner-facing commitment missed DM successfully', async () => {
    const input = {
      id: 'comm-owner-1',
      text: 'Finalize enterprise SLA document',
      actionUrl: 'http://localhost:3000/commitments/comm-owner-1',
    }

    const res = await slackNotifyService.sendCommitmentMissedOwner(
      mockIntegration,
      'owner@acme.com',
      input
    )

    expect(res.ok).toBe(true)
    expect(sendDirectMessageSpy).toHaveBeenCalledTimes(1)
    expect(sendDirectMessageSpy.mock.calls[0][1]).toBe('owner@acme.com')
  })

  it('performs manager alert fan-out sequentially with rate-limit delays and preference gating', async () => {
    // Mock getManagersToNotify to return 3 managers
    jest.spyOn(notificationsService, 'getManagersToNotify').mockResolvedValue([
      { id: 'mgr-1', email: 'mgr1@acme.com', name: 'Manager 1' },
      { id: 'mgr-2', email: 'mgr2@acme.com', name: 'Manager 2' },
      { id: 'mgr-3', email: 'mgr3@acme.com', name: 'Manager 3' },
    ])

    // Mock preferences: mgr-1 enabled, mgr-2 disabled, mgr-3 enabled
    jest.spyOn(notificationsService, 'shouldSendSlack').mockImplementation(async (userId) => {
      if (userId === 'mgr-2') return false
      return true
    })

    // Mock dedup: all fresh
    jest.spyOn(notificationsService, 'checkAndSetDedup').mockResolvedValue(true)

    const commitment = {
      id: 'comm-missed-fanout',
      text: 'Database indexing patch',
      ownerName: 'Dave Developer',
      ownerId: 'dev-dave',
      commitmentScore: 90,
    }

    const startTime = Date.now()
    const result = await slackNotifyService.sendManagerAlerts(
      commitment,
      'team-slack-integ-1',
      mockIntegration,
      50 // fast delay for unit test run
    )
    const duration = Date.now() - startTime

    expect(result.sent).toBe(2)
    expect(result.skipped).toBe(1)
    expect(result.failed).toBe(0)

    // Verify 2 DMs sent for mgr-1 and mgr-3
    expect(sendDirectMessageSpy).toHaveBeenCalledTimes(2)
    expect(sendDirectMessageSpy.mock.calls[0][1]).toBe('mgr1@acme.com')
    expect(sendDirectMessageSpy.mock.calls[1][1]).toBe('mgr3@acme.com')

    // Verify sequential delay occurred
    expect(duration).toBeGreaterThanOrEqual(40)
  })

  it('skips duplicate manager alerts when dedup key already exists in Redis', async () => {
    jest.spyOn(notificationsService, 'getManagersToNotify').mockResolvedValue([
      { id: 'mgr-dup-1', email: 'mgrdup1@acme.com', name: 'Manager Dup 1' },
    ])
    jest.spyOn(notificationsService, 'shouldSendSlack').mockResolvedValue(true)

    // Simulate dedup hit (already sent)
    jest.spyOn(notificationsService, 'checkAndSetDedup').mockResolvedValue(false)

    const commitment = {
      id: 'comm-dup-test',
      text: 'Duplicate test item',
      ownerName: 'Eve',
      ownerId: 'dev-eve',
    }

    const result = await slackNotifyService.sendManagerAlerts(
      commitment,
      'team-slack-integ-1',
      mockIntegration,
      0
    )

    expect(result.sent).toBe(0)
    expect(result.skipped).toBe(1)
    expect(sendDirectMessageSpy).not.toHaveBeenCalled()
  })

  it('dispatches celebratory commitment fulfilled DM', async () => {
    const input = {
      id: 'comm-fulfilled-1',
      text: 'Deploy v2.0 API gateway',
      ownerName: 'Frank',
      actionUrl: 'http://localhost:3000/commitments/comm-fulfilled-1',
    }

    const res = await slackNotifyService.sendCommitmentFulfilled(
      mockIntegration,
      'frank@acme.com',
      input
    )

    expect(res.ok).toBe(true)
    expect(sendDirectMessageSpy).toHaveBeenCalledTimes(1)
    expect(sendDirectMessageSpy.mock.calls[0][1]).toBe('frank@acme.com')
  })
})
