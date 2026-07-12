import { Worker, Job, UnrecoverableError } from 'bullmq'
import { logger } from '../../config/logger'
import { prisma } from '../../db/client'
import { resolveProvider } from '../../modules/integrations/integrations.service'
import { ProviderType } from '../../modules/integrations/integrations.types'
import { googleCalendarProvider } from '../../modules/integrations/providers/google-calendar.provider'
import { encrypt } from '../../utils/crypto'
import { notifyQueue } from '../queue.client'
import { addSeconds } from 'date-fns'

const CIRCUIT_BREAKER_THRESHOLD = 5

/**
 * Errors that represent a permanent, non-retriable state.
 * These immediately trip the circuit breaker — no point retrying.
 *
 * - GOOGLE_REFRESH_TOKEN_REVOKED: user explicitly revoked app access in
 *   their Google account settings. The token is cryptographically dead;
 *   retrying will always get 400 invalid_grant from Google's token endpoint.
 */
const NON_RETRIABLE_ERRORS = new Set([
    'GOOGLE_CALENDAR: GOOGLE_REFRESH_TOKEN_REVOKED',
    'GOOGLE_CALENDAR: GOOGLE_AUTH_CODE_INVALID',
])

export interface TokenRefreshJobData {
  type: 'team' | 'user'
  integrationId: string
}

export const tokenRefreshWorker = new Worker<TokenRefreshJobData>(
  'token-refresh',
  async (job: Job<TokenRefreshJobData>) => {
    const { type, integrationId } = job.data
    logger.info({ jobId: job.id, type, integrationId }, 'token-refresh.worker: processing job')

    if (type === 'team') {
      await refreshTeamIntegration(integrationId)
    } else if (type === 'user') {
      await refreshUserIntegration(integrationId)
    }
  },
  {
    connection: { host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT ?? '6379') },
    concurrency: parseInt(process.env.WORKER_CONCURRENCY_INTEGRATE || '2', 10),
  }
)

async function refreshTeamIntegration(integrationId: string): Promise<void> {
    const start = Date.now()
    const integration = await prisma.teamIntegration.findUnique({ where: { id: integrationId } })
    if (!integration || !integration.isActive || !integration.refreshTokenEnc) {
        return
    }

    try {
        const providerClient = resolveProvider(integration.provider as ProviderType)
        const result = await providerClient.refreshAccessToken(integration.refreshTokenEnc)

        if (result.accessToken && result.accessToken !== integration.refreshTokenEnc) {
            await prisma.teamIntegration.update({
                where: { id: integration.id },
                data: {
                    accessTokenEnc: encrypt(result.accessToken),
                    ...(result.refreshToken ? { refreshTokenEnc: encrypt(result.refreshToken) } : {}),
                    tokenExpiresAt: result.expiresIn ? addSeconds(new Date(), result.expiresIn) : null,
                    consecutiveErrors: 0,
                    lastError: null,
                },
            })
        }
        logger.info({ integrationId: integration.id, provider: integration.provider, latencyMs: Date.now() - start }, 'token-refresh.worker: team integration refreshed')
    } catch (err: any) {
        const latencyMs = Date.now() - start
        logger.error({ integrationId: integration.id, provider: integration.provider, error: err.message, latencyMs }, 'token-refresh.worker: team integration refresh failed')

        const updated = await prisma.teamIntegration.update({
            where: { id: integration.id },
            data: { consecutiveErrors: { increment: 1 }, lastError: err.message },
            select: { consecutiveErrors: true, teamId: true },
        })

        if (updated.consecutiveErrors >= CIRCUIT_BREAKER_THRESHOLD) {
            await prisma.teamIntegration.update({
                where: { id: integration.id },
                data: { isActive: false, disconnectedAt: new Date() },
            })
            await notifyQueue.add('send-notification', {
                type: 'INTEGRATION_AUTO_DISABLED',
                teamId: updated.teamId,
                metadata: { provider: integration.provider, reason: 'token_refresh_failed_5_times' },
            })
            logger.error({ integrationId: integration.id, provider: integration.provider }, 'token-refresh.worker: circuit breaker tripped')
        }
        throw err
    }
}

async function refreshUserIntegration(integrationId: string): Promise<void> {
    const start = Date.now()
    const integration = await prisma.userIntegration.findUnique({
        where: { id: integrationId },
        include: { user: { select: { email: true, name: true } } }
    })
    if (!integration || !integration.syncEnabled || !integration.refreshTokenEnc) {
        return
    }

    try {
        const result = await googleCalendarProvider.refreshAccessToken(integration.refreshTokenEnc)

        await prisma.userIntegration.update({
            where: { id: integration.id },
            data: {
                accessTokenEnc: encrypt(result.accessToken),
                tokenExpiresAt: result.expiresAt,
                consecutiveErrors: 0,
                lastError: null,
            },
        })
        logger.info({ integrationId: integration.id, userId: integration.userId, latencyMs: Date.now() - start }, 'token-refresh.worker: user integration refreshed')
    } catch (err: any) {
        const latencyMs = Date.now() - start
        logger.error({ integrationId: integration.id, userId: integration.userId, error: err.message, latencyMs }, 'token-refresh.worker: user integration refresh failed')

        const isNonRetriable = NON_RETRIABLE_ERRORS.has(err.message)

        if (isNonRetriable) {
            // Immediately trip the circuit breaker — no point accumulating errors.
            // The refresh token is cryptographically dead; retrying is futile.
            await prisma.userIntegration.update({
                where: { id: integration.id },
                data: {
                    syncEnabled: false,
                    consecutiveErrors: CIRCUIT_BREAKER_THRESHOLD,
                    lastError: err.message,
                },
            })
            await notifyQueue.add(
                'send-notification',
                {
                    type: 'CALENDAR_RECONNECT_REQUIRED',
                    teamId: '',
                    metadata: {
                        userId: integration.userId,
                        userEmail: integration.user?.email,
                        userName: integration.user?.name,
                        reason: 'token_revoked',
                    },
                },
                { jobId: `calendar-reconnect-notify:${integration.id}` } // dedup notification
            )
            logger.error(
                { integrationId: integration.id, userId: integration.userId, error: err.message },
                'token-refresh.worker: non-retriable error — circuit breaker tripped immediately'
            )
            // UnrecoverableError tells BullMQ: do NOT retry, mark as permanently failed.
            throw new UnrecoverableError(`Non-retriable: ${err.message}`)
        }

        const updated = await prisma.userIntegration.update({
            where: { id: integration.id },
            data: { consecutiveErrors: { increment: 1 }, lastError: err.message },
            select: { consecutiveErrors: true },
        })

        if (updated.consecutiveErrors >= CIRCUIT_BREAKER_THRESHOLD) {
            await prisma.userIntegration.update({
                where: { id: integration.id },
                data: { syncEnabled: false },
            })
            await notifyQueue.add(
                'send-notification',
                {
                    type: 'CALENDAR_RECONNECT_REQUIRED',
                    teamId: '',
                    metadata: {
                        userId: integration.userId,
                        userEmail: integration.user?.email,
                        userName: integration.user?.name,
                        reason: 'consecutive_errors',
                    },
                },
                { jobId: `calendar-reconnect-notify:${integration.id}` } // dedup notification
            )
            logger.error({ integrationId: integration.id, userId: integration.userId }, 'token-refresh.worker: user calendar circuit breaker tripped')
        }
        throw err
    }
}

tokenRefreshWorker.on('failed', async (job, err) => {
  logger.error({ jobId: job?.id, err }, 'token-refresh.worker: job failed')
})
