import { Worker, Job, UnrecoverableError } from 'bullmq'
import { randomUUID } from 'crypto'
import { logger } from '../../config/logger'
import { IntegrateJobData } from '../jobs/integrate.job'
import { prisma } from '../../db/client'
import { redis } from '../../config/redis'
import { getProvider } from '../../modules/integrations/providers/provider.registry'
import { TeamProvider } from '@prisma/client'
import { AppError } from '../../utils/errors'
import { socketEmitter } from '../../realtime/socket.emitter'
import { SERVER_EVENTS } from '../../realtime/socket.events'
import { notifyQueue } from '../queue.client'
import { getValidAccessToken } from '../../services/token-refresh.service'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Idempotency key TTL: 24h — matches the 24h convention for external-operation
 *  idempotency windows (Day 58 §14, §20). */
const IDEMPOTENCY_TTL = 86400
const IDEMPOTENCY_DONE_KEY = (key: string) => `integrate:done:${key}`

/** consecutiveErrors threshold before the integration is auto-disabled (§15). */
const MAX_CONSECUTIVE_ERRORS = 5

// ─────────────────────────────────────────────────────────────────────────────
// Error classification helpers
//
// 4xx-class AppErrors are NON-RETRYABLE — they represent configuration or
// permission problems that will not self-resolve through waiting.
//
// 5xx-class or network errors are RETRYABLE — handled by BullMQ's queue-level
// backoff policy. The worker itself contains no custom retry loop.
// ─────────────────────────────────────────────────────────────────────────────
const NON_RETRYABLE_ERROR_CODES = new Set([
    'JIRA_TOKEN_INVALID',
    'JIRA_ACCESS_DENIED',
    'JIRA_FIELD_VALIDATION_FAILED',
    'JIRA_PROJECT_NOT_FOUND',
    'JIRA_NO_ACCESSIBLE_SITES',
    'JIRA_AUTH_CODE_INVALID',
    'INTEGRATION_NOT_CONNECTED',
    'PROVIDER_NOT_SUPPORTED',
    'PROVIDER_NOT_CONFIGURED',
])

function isNonRetryable(error: any): boolean {
    if (error instanceof UnrecoverableError) return true
    if (error instanceof AppError && NON_RETRYABLE_ERROR_CODES.has(error.code)) return true

    // Also classify by HTTP status class
    const status = error.statusCode ?? error.status
    if (status && status >= 400 && status < 500 && status !== 429) return true

    return false
}

// ─────────────────────────────────────────────────────────────────────────────
// integrate.worker.ts — Full production replacement for the Day 18 scaffold
//
// Processing sequence (Day 58 §14):
//   Step 1  — Idempotency check (BEFORE any other work)
//   Step 2  — Load the team's active integration (NON-RETRYABLE if missing)
//   Step 3  — Load the action item (silent no-op if deleted)
//   Step 4  — Resolve the provider via registry (never importing concrete provider)
//   Step 5  — Obtain a valid access token via shared getValidAccessToken()
//   Step 6  — Call createExternalItem()
//   Step 7  — Persist jiraIssueId / jiraIssueUrl / jiraIssueSyncedAt
//   Step 8  — Mark idempotency complete (AFTER successful persistence)
//   Step 9  — Emit real-time Socket.io event to the team room
// ─────────────────────────────────────────────────────────────────────────────
export const integrateWorker = new Worker<IntegrateJobData>(
    'integrate',
    async (job: Job<IntegrateJobData>) => {
        const startMs = Date.now()
        const { teamId, actionItemId, provider, idempotencyKey: rawKey, meetingId } = job.data

        // Generate an idempotency key if the caller didn't supply one.
        // This covers internal enqueue calls (e.g. from action completion handler)
        // that don't go through the POST /:id/sync endpoint.
        const idempotencyKey = rawKey ?? randomUUID()

        logger.info(
            { jobId: job.id, actionItemId, provider, teamId, idempotencyKey },
            'integrate.worker: processing job'
        )

        // ─── Step 1: Idempotency check ───────────────────────────────────────
        // Redis EXISTS integrate:done:{key}
        // If already present → fast no-op, zero side effects, no API calls
        const doneKey = IDEMPOTENCY_DONE_KEY(idempotencyKey)
        const alreadyDone = await redis.exists(doneKey)
        if (alreadyDone) {
            logger.info(
                { actionItemId, provider, idempotencyKey },
                'integrate.worker.idempotent_skip: already processed'
            )
            return
        }

        // ─── Step 2: Load the team's active integration ──────────────────────
        const integration = await prisma.teamIntegration.findFirst({
            where: { teamId, provider: provider as TeamProvider, isActive: true },
        })

        if (!integration) {
            // NON-RETRYABLE: retrying "integration not connected" accomplishes nothing
            logger.warn({ teamId, provider, actionItemId }, 'integrate.worker: integration not connected')
            throw new UnrecoverableError('INTEGRATION_NOT_CONNECTED')
        }

        // ─── Step 3: Load the action item ────────────────────────────────────
        const actionItem = await prisma.actionItem.findFirst({
            where: { id: actionItemId, teamId },
            include: {
                assignee: { select: { id: true, email: true, name: true } },
                meeting: { select: { id: true, title: true, startedAt: true } },
            },
        })

        if (!actionItem) {
            // Silent no-op: the action item may have been deleted between enqueue
            // and worker processing. This is an expected, benign user action, not a
            // system fault — not logged as an error.
            logger.info(
                { actionItemId, teamId },
                'integrate.worker: action item not found (may have been deleted) — skipping'
            )
            return
        }

        // ─── Step 4: Resolve the provider via registry ───────────────────────
        // DESIGN RULE (Principle 2): getProvider() is the ONLY way to obtain a
        // provider — never import jira.provider.ts directly from this file.
        const providerClient = getProvider(provider as TeamProvider)

        // ─── Step 5: Obtain a valid access token ─────────────────────────────
        // getValidAccessToken() handles proactive refresh, token encryption,
        // and persistence of new tokens — including Jira's reissued refresh tokens.
        let accessToken: string
        try {
            accessToken = await getValidAccessToken(integration, true /* isTeamLevel */)
        } catch (tokenError: any) {
            logger.error(
                { teamId, provider, integrationId: integration.id, err: tokenError.message },
                'integrate.worker: token refresh failed'
            )
            // Token failure is NON-RETRYABLE if it's a revocation (user must reconnect)
            if (isNonRetryable(tokenError)) {
                throw new UnrecoverableError(`TOKEN_REFRESH_FAILED: ${tokenError.message}`)
            }
            throw tokenError
        }

        // ─── Step 6: Call createExternalItem() ───────────────────────────────
        const meetingTitle = actionItem.meeting?.title || 'Vocaply Meeting'
        const meetingDate = actionItem.meeting?.startedAt || actionItem.createdAt

        let externalResult: { externalId: string; externalUrl: string }
        try {
            if (!providerClient.createExternalItem) {
                throw new UnrecoverableError(`PROVIDER_NOT_SUPPORTED: ${provider} does not support createExternalItem`)
            }
            externalResult = await providerClient.createExternalItem(integration, {
                actionItemId: actionItem.id,
                text: actionItem.text,
                priority: (actionItem.priority as any) || 'MEDIUM',
                dueDate: actionItem.dueDate,
                assigneeEmail: actionItem.assignee?.email || null,
                context: {
                    meetingTitle,
                    meetingDate,
                    transcriptExcerpt: null, // future: pass excerpt from meeting transcript
                },
                teamMetadata: (integration.metadata as Record<string, unknown>) || {},
            })
        } catch (providerError: any) {
            const statusClass = isNonRetryable(providerError) ? '4xx' : '5xx'
            logger.error(
                {
                    teamId,
                    actionItemId,
                    provider,
                    statusClass,
                    err: providerError.message,
                    code: providerError.code,
                },
                'integrate.worker.issue_creation_failed'
            )

            if (isNonRetryable(providerError)) {
                throw new UnrecoverableError(providerError.message)
            }
            throw providerError
        }

        // ─── Step 7: Persist the result ──────────────────────────────────────
        // DB write AFTER a fully successful API response — no partial/corrupt state possible
        const providerPrefix = provider.toLowerCase()
        const updateData: any = {}
        updateData[`${providerPrefix}IssueId`] = externalResult.externalId
        updateData[`${providerPrefix}IssueUrl`] = externalResult.externalUrl
        updateData[`${providerPrefix}IssueSyncedAt`] = new Date()

        await prisma.actionItem.update({
            where: { id: actionItem.id },
            data: updateData,
        })

        // Also update the integration's lastSyncedAt and record health success
        await prisma.teamIntegration.update({
            where: { id: integration.id },
            data: {
                lastSyncedAt: new Date(),
            },
        })
        const { integrationHealthService } = await import('../../services/integration-health.service')
        await integrationHealthService.recordSuccess({
            id: integration.id,
            provider: integration.provider,
            consecutiveErrors: integration.consecutiveErrors,
            lastError: integration.lastError,
            teamId: integration.teamId,
            isTeamLevel: true,
        })

        // ─── Step 8: Mark idempotency complete ───────────────────────────────
        // Set AFTER successful persistence, not before.
        // If the process crashes between Step 7 and Step 8, the worst outcome is
        // a harmless re-run (the DB update is naturally idempotent — writing the
        // same jiraIssueId twice causes no harm).
        await redis.setex(doneKey, IDEMPOTENCY_TTL, '1')

        const durationMs = Date.now() - startMs
        logger.info(
            {
                teamId,
                actionItemId,
                provider,
                externalIssueId: externalResult.externalId,
                durationMs,
                meetingId,
            },
            'integrate.worker.issue_created'
        )

        // ─── Step 9: Emit real-time update ────────────────────────────────────
        // Socket.io 'action_item:synced' to the team room — the dashboard's
        // SyncToJiraButton can react without polling.
        try {
            socketEmitter
                .to(`team:${teamId}`)
                .emit(SERVER_EVENTS.ACTION_ITEM_SYNCED, {
                    actionItemId: actionItem.id,
                    provider,
                    success: true,
                    externalId: externalResult.externalId,
                    externalUrl: externalResult.externalUrl,
                })
        } catch (socketErr: any) {
            // Socket.io emit failure is non-fatal — the sync itself succeeded
            logger.warn(
                { teamId, err: socketErr.message },
                'integrate.worker: Socket.io emit failed (non-fatal)'
            )
        }
    },
    {
        connection: {
            host: process.env.REDIS_HOST ?? 'localhost',
            port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
            password: process.env.REDIS_PASSWORD,
        },
        /**
         * concurrency: 3 — deliberately lower than calendar sync's 5 (Day 58 §20).
         * Jira Cloud rate limits are more conservative and more variable than Google
         * Calendar's. Ticket creation has externally-visible side effects per call
         * — a lower concurrency ceiling is appropriate for an operation with higher
         * per-call consequence if something goes systematically wrong.
         */
        concurrency: parseInt(process.env.WORKER_CONCURRENCY_INTEGRATE ?? '3', 10),
    }
)

// ─────────────────────────────────────────────────────────────────────────────
// Worker event handlers
// ─────────────────────────────────────────────────────────────────────────────

integrateWorker.on('failed', async (job, err) => {
    if (!job) return

    const { teamId, actionItemId, provider, idempotencyKey } = job.data

    logger.error(
        { jobId: job.id, teamId, actionItemId, provider, err: err.message, attemptsMade: job.attemptsMade },
        'integrate.worker: job failed'
    )

    // If this is a terminal failure (all attempts exhausted or non-retryable),
    // increment consecutiveErrors and potentially auto-disable the integration.
    const isTerminal = err instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 5)

    if (isTerminal) {
        try {
            const integration = await prisma.teamIntegration.findFirst({
                where: { teamId, provider: provider as TeamProvider },
                select: { id: true, provider: true, consecutiveErrors: true, lastError: true, teamId: true },
            })

            if (integration) {
                const { integrationHealthService } = await import('../../services/integration-health.service')
                await integrationHealthService.recordFailure(
                    {
                        id: integration.id,
                        provider: integration.provider,
                        consecutiveErrors: integration.consecutiveErrors,
                        lastError: integration.lastError,
                        teamId: integration.teamId,
                        isTeamLevel: true,
                    },
                    err.message
                )
            }
        } catch (dbErr: any) {
            logger.error(
                { teamId, provider, err: dbErr.message },
                'integrate.worker: failed to record integration failure via health service (non-fatal)'
            )
        }

        // Emit failure event for real-time UI update
        try {
            socketEmitter.to(`team:${teamId}`).emit(SERVER_EVENTS.ACTION_ITEM_SYNCED, {
                actionItemId,
                provider,
                success: false,
                error: err.message,
            })
        } catch (_) {
            // Socket.io emit failure is non-fatal
        }
    }
})

integrateWorker.on('completed', (job) => {
    logger.debug(
        { jobId: job.id, actionItemId: job.data.actionItemId, provider: job.data.provider },
        'integrate.worker: job completed'
    )
})
