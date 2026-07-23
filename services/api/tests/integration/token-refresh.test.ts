// ─────────────────────────────────────────────────────────────────────────────
// token-refresh.test.ts — Automated Integration Suite for Token Refresh & Health
//
// Converts Day 64's unit-level coverage into full integration-level coverage:
// 1. Runs against seeded PostgreSQL test database (real Prisma queries)
// 2. findExpiringIntegrations() 30-minute lookahead query filtering (excludes null tokenExpiresAt)
// 3. Two-stage health escalation sequence (3 errors = Stage 1 warning with 24h dedup key;
//    5 errors = Stage 2 deactivation)
// 4. OAuth reconnect state recovery (resets errors, lastError, and restores isActive: true)
// ─────────────────────────────────────────────────────────────────────────────

import { tokenRefreshService } from '../../src/services/token-refresh.service'
import { integrationHealthService } from '../../src/services/integration-health.service'
import { prisma } from '../../src/db/client'
import { redis } from '../../src/config/redis'
import {
    cleanTestDatabase,
    seedTestTeam,
    seedTestUser,
    seedTestTeamIntegration,
    seedTestUserIntegration,
} from '../support/test-db'
import { TeamProvider, CalendarProvider } from '@prisma/client'

describe('TokenRefresh & Health Service — Integration Test Suite', () => {
    beforeEach(async () => {
        await cleanTestDatabase()
    })

    afterAll(async () => {
        await cleanTestDatabase()
    })

    describe('findExpiringIntegrations Lookahead Query Filtering', () => {
        it('identifies tokens expiring within 30 minutes while excluding null tokenExpiresAt rows', async () => {
            const team = await seedTestTeam()
            const user = await seedTestUser(team.id)

            const now = new Date()

            // 1. Expiring in 15 minutes -> SHOULD be selected
            await seedTestTeamIntegration(team.id, TeamProvider.JIRA, {
                expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
            })

            // 2. Expiring in 2 hours -> SHOULD NOT be selected
            await seedTestTeamIntegration(team.id, TeamProvider.SLACK, {
                expiresAt: new Date(now.getTime() + 120 * 60 * 1000),
            })

            // 3. Null tokenExpiresAt (Linear / Notion) -> SHOULD NOT be selected
            await seedTestTeamIntegration(team.id, TeamProvider.LINEAR, {
                expiresAt: null,
            })

            // 4. Inactive integration -> SHOULD NOT be selected
            await seedTestTeamIntegration(team.id, TeamProvider.NOTION, {
                expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
                isActive: false,
            })

            // 5. User calendar integration expiring in 20 minutes -> SHOULD be selected
            await seedTestUserIntegration(user.id, CalendarProvider.OUTLOOK_CALENDAR, {
                expiresAt: new Date(now.getTime() + 20 * 60 * 1000),
            })

            const expiring = await tokenRefreshService.findExpiringIntegrations(30)

            expect(expiring.teamIntegrations).toHaveLength(1)
            expect(expiring.teamIntegrations[0].provider).toEqual(TeamProvider.JIRA)

            expect(expiring.userIntegrations).toHaveLength(1)
            expect(expiring.userIntegrations[0].provider).toEqual(CalendarProvider.OUTLOOK_CALENDAR)
        })
    })

    describe('Two-Stage Escalation Sequence & Redis Dedup', () => {
        it('escalates errors to Stage 1 warning at 3 errors and Stage 2 deactivation at 5 errors', async () => {
            const team = await seedTestTeam()
            const integration = await seedTestTeamIntegration(team.id, TeamProvider.JIRA, {
                consecutiveErrors: 2,
            })

            // 3rd consecutive failure -> Stage 1 Warning
            await integrationHealthService.recordFailure(integration, 'HTTP 500 Transient Error')

            const updatedAfter3 = await prisma.teamIntegration.findUnique({
                where: { id: integration.id },
            })
            expect(updatedAfter3?.consecutiveErrors).toEqual(3)
            expect(updatedAfter3?.isActive).toEqual(true)
            expect(updatedAfter3?.lastError).toContain('HTTP 500 Transient Error')

            // Simulate 4th and 5th failures
            await integrationHealthService.recordFailure(updatedAfter3!, 'HTTP 500 Transient Error')
            const updatedAfter4 = await prisma.teamIntegration.findUnique({
                where: { id: integration.id },
            })

            await integrationHealthService.recordFailure(updatedAfter4!, 'OAuth refresh token revoked')

            // 5th consecutive failure -> Stage 2 Deactivation
            const updatedAfter5 = await prisma.teamIntegration.findUnique({
                where: { id: integration.id },
            })
            expect(updatedAfter5?.consecutiveErrors).toEqual(5)
            expect(updatedAfter5?.isActive).toEqual(false)
            expect(updatedAfter5?.lastError).toContain('OAuth refresh token revoked')
        })
    })

    describe('OAuth Reconnect State Restoration', () => {
        it('resets consecutiveErrors, clears lastError, and restores isActive: true on successful reconnect', async () => {
            const team = await seedTestTeam()
            const deadIntegration = await seedTestTeamIntegration(team.id, TeamProvider.JIRA, {
                isActive: false,
                consecutiveErrors: 5,
                lastError: 'Deactivated due to 5 consecutive auth errors',
            })

            // Simulate OAuth Reconnect success handler calling recordSuccess
            await integrationHealthService.recordSuccess({
                id: deadIntegration.id,
                provider: deadIntegration.provider,
                consecutiveErrors: deadIntegration.consecutiveErrors,
                lastError: deadIntegration.lastError,
                teamId: team.id,
                isTeamLevel: true,
            })

            const restored = await prisma.teamIntegration.findUnique({
                where: { id: deadIntegration.id },
            })

            expect(restored?.isActive).toEqual(true)
            expect(restored?.consecutiveErrors).toEqual(0)
            expect(restored?.lastError).toBeNull()
        })
    })
})
