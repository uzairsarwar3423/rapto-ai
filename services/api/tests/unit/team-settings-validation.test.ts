import { updateTeamSchema } from '../../src/modules/teams/teams.validator'
import { teamsService } from '../../src/modules/teams/teams.service'
import { cleanTestDatabase, seedTestTeam, seedTestTeamIntegration } from '../support/test-db'
import { TeamProvider } from '@prisma/client'
import { AppError } from '../../src/utils/errors'

describe('Team Settings Validation Unit Tests', () => {
  beforeEach(async () => {
    await cleanTestDatabase()
  })

  afterAll(async () => {
    await cleanTestDatabase()
  })

  it('rejects SLACK in autoSyncProviders at the schema level', () => {
    const invalidPayload = {
      settings: {
        autoSyncEnabled: true,
        autoSyncProviders: ['SLACK'],
      },
    }

    const result = updateTeamSchema.body.safeParse(invalidPayload)
    expect(result.success).toBe(false)
  })

  it('rejects autoSyncProviders if provider has no active integration (422)', async () => {
    const team = await seedTestTeam()

    await expect(
      teamsService.updateTeamSettings(team.id, {
        settings: {
          autoSyncEnabled: true,
          autoSyncProviders: ['NOTION'], // Notion is not connected for this team
        },
      })
    ).rejects.toThrow(AppError)

    try {
      await teamsService.updateTeamSettings(team.id, {
        settings: {
          autoSyncEnabled: true,
          autoSyncProviders: ['NOTION'],
        },
      })
    } catch (err: any) {
      expect(err.statusCode).toBe(422)
      expect(err.code).toBe('INVALID_AUTO_SYNC_PROVIDER')
    }
  })

  it('merges autoSync settings into existing team settings without disturbing other keys', async () => {
    const team = await seedTestTeam({
      settings: {
        defaultTimezone: 'America/New_York',
        weeklyDigestEnabled: true,
      },
    })

    await seedTestTeamIntegration(team.id, TeamProvider.JIRA)

    const updated = await teamsService.updateTeamSettings(team.id, {
      settings: {
        autoSyncEnabled: true,
        autoSyncProviders: ['JIRA'],
      },
    })

    expect(updated.settings.defaultTimezone).toBe('America/New_York')
    expect(updated.settings.weeklyDigestEnabled).toBe(true)
    expect(updated.settings.autoSyncEnabled).toBe(true)
    expect(updated.settings.autoSyncProviders).toEqual(['JIRA'])
  })
})
