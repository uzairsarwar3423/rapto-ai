import { integrationHealthService, WARNING_THRESHOLD, DEACTIVATION_THRESHOLD } from '../../services/integration-health.service'
import { prisma } from '../../db/client'
import { redis } from '../../config/redis'
import { notifyQueue } from '../../queues/queue.client'

jest.mock('../../db/client', () => ({
    prisma: {
        teamIntegration: {
            update: jest.fn(),
        },
        userIntegration: {
            update: jest.fn(),
        },
    },
}))

jest.mock('../../config/redis', () => ({
    redis: {
        set: jest.fn(),
    },
}))

jest.mock('../../queues/queue.client', () => ({
    notifyQueue: {
        add: jest.fn(),
    },
}))

describe('IntegrationHealthService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('recordSuccess', () => {
        it('fast-paths without DB write if already healthy (0 errors, no lastError)', async () => {
            const healthyRow = {
                id: 'team-1',
                provider: 'JIRA',
                consecutiveErrors: 0,
                lastError: null,
                teamId: 't-123',
                isTeamLevel: true,
            }

            await integrationHealthService.recordSuccess(healthyRow)

            expect(prisma.teamIntegration.update).not.toHaveBeenCalled()
            expect(prisma.userIntegration.update).not.toHaveBeenCalled()
        })

        it('resets consecutiveErrors to 0 and clears lastError on unhealthy team integration', async () => {
            const unhealthyRow = {
                id: 'team-1',
                provider: 'JIRA',
                consecutiveErrors: 2,
                lastError: 'HTTP 500',
                teamId: 't-123',
                isTeamLevel: true,
            }

            await integrationHealthService.recordSuccess(unhealthyRow)

            expect(prisma.teamIntegration.update).toHaveBeenCalledWith({
                where: { id: 'team-1' },
                data: {
                    consecutiveErrors: 0,
                    lastError: null,
                    isActive: true,
                },
            })
        })
    })

    describe('recordFailure & threshold escalation', () => {
        it('increments consecutiveErrors and sets sanitized lastError', async () => {
            const row = {
                id: 'team-1',
                provider: 'JIRA',
                consecutiveErrors: 0,
                lastError: null,
                teamId: 't-123',
                isTeamLevel: true,
            }

            ;(prisma.teamIntegration.update as jest.Mock).mockResolvedValueOnce({
                consecutiveErrors: 1,
                teamId: 't-123',
            })

            await integrationHealthService.recordFailure(row, 'Bearer secret-token-123 failed')

            expect(prisma.teamIntegration.update).toHaveBeenCalledWith({
                where: { id: 'team-1' },
                data: {
                    consecutiveErrors: { increment: 1 },
                    lastError: 'Bearer [REDACTED] failed',
                },
                select: { consecutiveErrors: true, teamId: true },
            })
        })

        it('triggers Stage 1 warning notification at 3 consecutive errors', async () => {
            const row = {
                id: 'team-1',
                provider: 'JIRA',
                consecutiveErrors: 2,
                lastError: null,
                teamId: 't-123',
                isTeamLevel: true,
            }

            ;(prisma.teamIntegration.update as jest.Mock).mockResolvedValueOnce({
                consecutiveErrors: 3,
                teamId: 't-123',
            })
            ;(redis.set as jest.Mock).mockResolvedValueOnce('OK')

            await integrationHealthService.recordFailure(row, 'Connection timeout')

            expect(redis.set).toHaveBeenCalledWith(
                'notif:dedup:INTEGRATION_WARNING:t-123:team-1',
                '1',
                'EX',
                86400,
                'NX'
            )
            expect(notifyQueue.add).toHaveBeenCalledWith(
                'send-notification',
                expect.objectContaining({
                    type: 'INTEGRATION_WARNING',
                    teamId: 't-123',
                })
            )
        })

        it('triggers Stage 2 deactivation at 5 consecutive errors', async () => {
            const row = {
                id: 'team-1',
                provider: 'JIRA',
                consecutiveErrors: 4,
                lastError: null,
                teamId: 't-123',
                isTeamLevel: true,
            }

            ;(prisma.teamIntegration.update as jest.Mock)
                .mockResolvedValueOnce({ consecutiveErrors: 5, teamId: 't-123' })
                .mockResolvedValueOnce({})
            ;(redis.set as jest.Mock).mockResolvedValueOnce('OK')

            await integrationHealthService.recordFailure(row, 'Invalid grant')

            expect(prisma.teamIntegration.update).toHaveBeenCalledWith({
                where: { id: 'team-1' },
                data: expect.objectContaining({
                    isActive: false,
                }),
            })
            expect(notifyQueue.add).toHaveBeenCalledWith(
                'send-notification',
                expect.objectContaining({
                    type: 'INTEGRATION_DEACTIVATED',
                    teamId: 't-123',
                })
            )
        })
    })
})
