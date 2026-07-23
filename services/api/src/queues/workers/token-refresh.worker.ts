/**
 * token-refresh.worker.ts — BullMQ worker for proactive token refresh.
 *
 * Principal Architecture:
 * - High concurrency (10), network-bound lightweight worker.
 * - Consumes `token-refresh` jobs dispatched by the 15-minute cron fan-out.
 * - Missing or inactive integrations are safe no-ops (deleted or disabled in the interim).
 * - Delegates outcome handling to refreshIntegration() and integrationHealthService.
 * - Configured with zero BullMQ-level retries to prevent error counter distortion.
 */

import { Worker, Job } from 'bullmq'
import { logger } from '../../config/logger'
import { prisma } from '../../db/client'
import { refreshIntegration } from '../../services/token-refresh.service'
import { TokenRefreshJobData } from '../jobs/token-refresh.job'
import { env } from '../../config/env'

export const tokenRefreshWorker = new Worker<TokenRefreshJobData>(
    'token-refresh',
    async (job: Job<TokenRefreshJobData>) => {
        const { type, integrationId } = job.data
        logger.info({ jobId: job.id, type, integrationId }, 'token-refresh.worker: processing job')

        const isTeamLevel = type === 'team'

        if (isTeamLevel) {
            const integration = await prisma.teamIntegration.findUnique({
                where: { id: integrationId },
            })

            // Safe no-op if missing, inactive, or missing refresh token
            if (!integration || !integration.isActive || !integration.refreshTokenEnc) {
                logger.info(
                    { integrationId, type },
                    'token-refresh.worker: integration missing, inactive, or unrefreshable — skipping'
                )
                return
            }

            await refreshIntegration(
                {
                    id: integration.id,
                    provider: integration.provider,
                    consecutiveErrors: integration.consecutiveErrors,
                    lastError: integration.lastError,
                    isActive: integration.isActive,
                    teamId: integration.teamId,
                    accessTokenEnc: integration.accessTokenEnc,
                    refreshTokenEnc: integration.refreshTokenEnc,
                    tokenExpiresAt: integration.tokenExpiresAt,
                    isTeamLevel: true,
                },
                true
            )
        } else {
            const integration = await prisma.userIntegration.findUnique({
                where: { id: integrationId },
            })

            if (!integration || !integration.syncEnabled || !integration.refreshTokenEnc) {
                logger.info(
                    { integrationId, type },
                    'token-refresh.worker: user integration missing, disabled, or unrefreshable — skipping'
                )
                return
            }

            await refreshIntegration(
                {
                    id: integration.id,
                    provider: integration.provider,
                    consecutiveErrors: integration.consecutiveErrors,
                    lastError: integration.lastError,
                    syncEnabled: integration.syncEnabled,
                    userId: integration.userId,
                    accessTokenEnc: integration.accessTokenEnc,
                    refreshTokenEnc: integration.refreshTokenEnc,
                    tokenExpiresAt: integration.tokenExpiresAt,
                    isTeamLevel: false,
                },
                false
            )
        }
    },
    {
        connection: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
        },
        concurrency: parseInt(process.env.WORKER_CONCURRENCY_TOKEN_REFRESH || '10', 10),
    }
)

tokenRefreshWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'token-refresh.worker: job failed')
})
