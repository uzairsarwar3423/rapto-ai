import { findExpiringIntegrations, refreshIntegration } from '../../services/token-refresh.service'
import { prisma } from '../../db/client'
import { integrationHealthService } from '../../services/integration-health.service'

jest.mock('../../db/client', () => ({
    prisma: {
        teamIntegration: {
            findMany: jest.fn(),
        },
        userIntegration: {
            findMany: jest.fn(),
        },
    },
}))

jest.mock('../../services/integration-health.service', () => ({
    integrationHealthService: {
        recordSuccess: jest.fn(),
        recordFailure: jest.fn(),
    },
}))

describe('TokenRefreshService Unit Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('findExpiringIntegrations', () => {
        it('queries team and user integrations filtered to active status and tokenExpiresAt lte lookahead', async () => {
            const mockTeamRows = [{ id: 'team-int-1', provider: 'JIRA', teamId: 't-1' }]
            const mockUserRows = [{ id: 'user-int-1', provider: 'GOOGLE_CALENDAR', userId: 'u-1' }]

            ;(prisma.teamIntegration.findMany as jest.Mock).mockResolvedValueOnce(mockTeamRows)
            ;(prisma.userIntegration.findMany as jest.Mock).mockResolvedValueOnce(mockUserRows)

            const result = await findExpiringIntegrations(30)

            expect(prisma.teamIntegration.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        isActive: true,
                        tokenExpiresAt: expect.objectContaining({ not: null }),
                    }),
                })
            )
            expect(prisma.userIntegration.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        syncEnabled: true,
                        tokenExpiresAt: expect.objectContaining({ not: null }),
                    }),
                })
            )

            expect(result.teamIntegrations).toEqual(mockTeamRows)
            expect(result.userIntegrations).toEqual(mockUserRows)
        })
    })
})
