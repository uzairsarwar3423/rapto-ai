import { prisma } from '../../src/db/client'
import { actionItemsRepository } from '../../src/modules/action-items/action-items.repository'
import { actionItemsService } from '../../src/modules/action-items/action-items.service'
import { integrateQueue } from '../../src/queues/queue.client'
import {
  cleanTestDatabase,
  seedTestTeam,
  seedTestMeeting,
  seedTestActionItem,
  seedTestTeamIntegration,
} from '../support/test-db'
import { TeamProvider } from '@prisma/client'

describe('Auto-Sync Eligibility & Fan-Out Unit Tests', () => {
  beforeEach(async () => {
    await cleanTestDatabase()
  })

  afterAll(async () => {
    await cleanTestDatabase()
  })

  describe('findAutoSyncEligibleItems repository query', () => {
    it('filters items by confidence threshold >= 0.5 and scopes to meeting & team', async () => {
      const team = await seedTestTeam()
      const meeting1 = await seedTestMeeting(team.id)
      const meeting2 = await seedTestMeeting(team.id)

      // High confidence item in meeting 1
      const itemHigh = await seedTestActionItem(team.id, meeting1.id, {
        text: 'High confidence item',
        confidenceScore: 0.85,
      })

      // Low confidence item in meeting 1
      const itemLow = await seedTestActionItem(team.id, meeting1.id, {
        text: 'Low confidence item',
        confidenceScore: 0.3,
      })

      // High confidence item in meeting 2 (different meeting)
      const itemOtherMeeting = await seedTestActionItem(team.id, meeting2.id, {
        text: 'Other meeting item',
        confidenceScore: 0.9,
      })

      const eligible = await actionItemsRepository.findAutoSyncEligibleItems(meeting1.id, team.id, 0.5)

      expect(eligible.length).toBe(1)
      expect(eligible[0].id).toBe(itemHigh.id)
    })
  })

  describe('enqueueAutoSyncJobs service function', () => {
    it('returns fast no-op (enqueuedCount 0) when autoSyncEnabled is false', async () => {
      const team = await seedTestTeam({
        settings: {
          autoSyncEnabled: false,
          autoSyncProviders: ['JIRA'],
        },
      })
      const meeting = await seedTestMeeting(team.id)
      await seedTestActionItem(team.id, meeting.id, { confidenceScore: 0.9 })

      const addSpy = jest.spyOn(integrateQueue, 'add')
      const result = await actionItemsService.enqueueAutoSyncJobs(meeting.id, team.id)

      expect(result.enqueuedCount).toBe(0)
      expect(addSpy).not.toHaveBeenCalled()
      addSpy.mockRestore()
    })

    it('enqueues N x M jobs for M eligible action items and N enabled active providers', async () => {
      const team = await seedTestTeam({
        settings: {
          autoSyncEnabled: true,
          autoSyncProviders: ['JIRA', 'LINEAR'],
        },
      })

      await seedTestTeamIntegration(team.id, TeamProvider.JIRA)
      await seedTestTeamIntegration(team.id, TeamProvider.LINEAR)

      const meeting = await seedTestMeeting(team.id)
      const item1 = await seedTestActionItem(team.id, meeting.id, { confidenceScore: 0.9 })
      const item2 = await seedTestActionItem(team.id, meeting.id, { confidenceScore: 0.8 })
      const item3 = await seedTestActionItem(team.id, meeting.id, { confidenceScore: 0.7 })

      const addSpy = jest.spyOn(integrateQueue, 'add').mockImplementation(async () => ({} as any))

      const result = await actionItemsService.enqueueAutoSyncJobs(meeting.id, team.id)

      expect(result.enqueuedCount).toBe(6) // 3 items x 2 providers
      expect(addSpy).toHaveBeenCalledTimes(6)

      // Verify deterministic idempotency key structure
      const firstCallArgs = addSpy.mock.calls[0]
      expect(firstCallArgs[0]).toBe('sync-action-item')
      expect(firstCallArgs[1]).toMatchObject({
        teamId: team.id,
        actionItemId: item1.id,
        provider: 'JIRA',
        idempotencyKey: `auto-sync:${item1.id}:JIRA:${meeting.id}`,
        meetingId: meeting.id,
        source: 'auto',
      })

      addSpy.mockRestore()
    })

    it('skips a provider listed in autoSyncProviders if it lacks an active TeamIntegration row', async () => {
      const team = await seedTestTeam({
        settings: {
          autoSyncEnabled: true,
          autoSyncProviders: ['JIRA', 'NOTION'], // Notion is NOT connected
        },
      })

      await seedTestTeamIntegration(team.id, TeamProvider.JIRA)

      const meeting = await seedTestMeeting(team.id)
      const item = await seedTestActionItem(team.id, meeting.id, { confidenceScore: 0.9 })

      const addSpy = jest.spyOn(integrateQueue, 'add').mockImplementation(async () => ({} as any))

      const result = await actionItemsService.enqueueAutoSyncJobs(meeting.id, team.id)

      expect(result.enqueuedCount).toBe(1) // Only Jira
      expect(addSpy).toHaveBeenCalledTimes(1)
      expect(addSpy.mock.calls[0][1].provider).toBe('JIRA')

      addSpy.mockRestore()
    })
  })
})
