/**
 * integration-health.service.ts — Centralized integration failure escalation & health tracking.
 *
 * Principal Architecture:
 * - Single authoritative service for recording success & failure across ALL providers (Jira, Linear, Notion, Slack, Google, Outlook).
 * - Enforces the Two-Stage Escalation Model:
 *     Stage 1: Early Warning at 3 consecutive errors (triggers INTEGRATION_WARNING notification, integration stays ACTIVE).
 *     Stage 2: Final Deactivation at 5 consecutive errors (flips isActive/syncEnabled to false, triggers INTEGRATION_DEACTIVATED notification).
 * - Implements fast-path no-op on recordSuccess() when already healthy (0 errors, no lastError).
 * - Enforces 24-hour Redis dedup key discipline (notif:dedup:*) to prevent notification storms.
 * - Supports table-agnostic handling for both TeamIntegration and UserIntegration rows.
 */

import { prisma } from '../db/client'
import { redis } from '../config/redis'
import { logger } from '../config/logger'
import { notifyQueue } from '../queues/queue.client'

export const WARNING_THRESHOLD = 3
export const DEACTIVATION_THRESHOLD = 5
export const DEDUP_TTL_SECONDS = 86400 // 24 Hours

export type IntegrationRow = {
    id: string
    provider: string
    consecutiveErrors: number
    lastError: string | null
    isActive?: boolean
    syncEnabled?: boolean
    teamId?: string
    userId?: string
    isTeamLevel?: boolean
}

/**
 * Sanitize error message to prevent token/secret leaks into database `lastError` column
 */
export function sanitizeErrorMessage(message: string): string {
    if (!message) return 'Unknown error'
    // Remove Bearer tokens, basic auth headers, access_token / refresh_token string values
    return message
        .replace(/Bearer\s+[A-Za-z0-9\-\._~\+\/]+=*/gi, 'Bearer [REDACTED]')
        .replace(/(access_token|refresh_token|client_secret)=[^&\s]+/gi, '$1=[REDACTED]')
        .replace(/Authorization:\s*[^\r\n]+/gi, 'Authorization: [REDACTED]')
        .substring(0, 1000)
}

export class IntegrationHealthService {
    /**
     * Record a successful operation for an integration.
     * Fast-paths without DB write if already in a healthy state (0 errors, no lastError).
     */
    async recordSuccess(integration: IntegrationRow): Promise<void> {
        // Fast-path: if already healthy, skip DB update
        if (integration.consecutiveErrors === 0 && integration.lastError === null) {
            return
        }

        const isTeamLevel = integration.isTeamLevel ?? Boolean(integration.teamId)

        if (isTeamLevel) {
            await prisma.teamIntegration.update({
                where: { id: integration.id },
                data: {
                    consecutiveErrors: 0,
                    lastError: null,
                    isActive: true,
                },
            })
        } else {
            await prisma.userIntegration.update({
                where: { id: integration.id },
                data: {
                    consecutiveErrors: 0,
                    lastError: null,
                    syncEnabled: true,
                },
            })
        }

        logger.info(
            { integrationId: integration.id, provider: integration.provider, isTeamLevel },
            'integration-health: recorded success — health state reset to healthy'
        )
    }

    /**
     * Record a failed operation for an integration.
     * Increments consecutiveErrors, updates lastError, and evaluates 2-stage thresholds.
     */
    async recordFailure(integration: IntegrationRow, rawErrorMessage: string): Promise<void> {
        const sanitizedError = sanitizeErrorMessage(rawErrorMessage)
        const isTeamLevel = integration.isTeamLevel ?? Boolean(integration.teamId)

        let updatedErrors = integration.consecutiveErrors + 1
        let updatedTeamId = integration.teamId
        let updatedUserId = integration.userId

        if (isTeamLevel) {
            const updated = await prisma.teamIntegration.update({
                where: { id: integration.id },
                data: {
                    consecutiveErrors: { increment: 1 },
                    lastError: sanitizedError,
                },
                select: { consecutiveErrors: true, teamId: true },
            })
            updatedErrors = updated.consecutiveErrors
            updatedTeamId = updated.teamId
        } else {
            const updated = await prisma.userIntegration.update({
                where: { id: integration.id },
                data: {
                    consecutiveErrors: { increment: 1 },
                    lastError: sanitizedError,
                },
                select: { consecutiveErrors: true, userId: true },
            })
            updatedErrors = updated.consecutiveErrors
            updatedUserId = updated.userId
        }

        logger.warn(
            {
                integrationId: integration.id,
                provider: integration.provider,
                consecutiveErrors: updatedErrors,
                error: sanitizedError,
            },
            'integration-health: recorded failure'
        )

        // Stage 1: Early Warning threshold reached (exactly at 3 errors)
        if (updatedErrors === WARNING_THRESHOLD) {
            await this.handleEarlyWarning(integration, updatedTeamId, updatedUserId, isTeamLevel)
        }

        // Stage 2: Final Deactivation threshold crossed (at 5 errors)
        if (updatedErrors >= DEACTIVATION_THRESHOLD && integration.consecutiveErrors < DEACTIVATION_THRESHOLD) {
            await this.deactivateIntegration(integration)
            await this.handleDeactivationNotification(integration, updatedTeamId, updatedUserId, isTeamLevel, sanitizedError)
        }
    }

    /**
     * Deactivate an integration (flip isActive: false or syncEnabled: false).
     */
    async deactivateIntegration(integration: IntegrationRow): Promise<void> {
        const isTeamLevel = integration.isTeamLevel ?? Boolean(integration.teamId)

        if (isTeamLevel) {
            await prisma.teamIntegration.update({
                where: { id: integration.id },
                data: {
                    isActive: false,
                    disconnectedAt: new Date(),
                },
            })
        } else {
            await prisma.userIntegration.update({
                where: { id: integration.id },
                data: {
                    syncEnabled: false,
                },
            })
        }

        logger.error(
            { integrationId: integration.id, provider: integration.provider, isTeamLevel },
            'integration-health: integration DEACTIVATED due to 5 consecutive errors'
        )
    }

    /**
     * Dispatch early warning notification with Redis dedup key protection
     */
    private async handleEarlyWarning(
        integration: IntegrationRow,
        teamId?: string,
        userId?: string,
        isTeamLevel = true
    ): Promise<void> {
        const targetId = isTeamLevel ? teamId : userId
        if (!targetId) return

        const dedupKey = `notif:dedup:INTEGRATION_WARNING:${targetId}:${integration.id}`

        try {
            const acquired = await redis.set(dedupKey, '1', 'EX', DEDUP_TTL_SECONDS, 'NX')
            if (!acquired) {
                logger.info(
                    { integrationId: integration.id, targetId },
                    'integration-health: warning notification skipped due to 24h dedup key'
                )
                return
            }

            await notifyQueue.add('send-notification', {
                type: 'INTEGRATION_WARNING',
                teamId: isTeamLevel ? teamId : undefined,
                ownerId: !isTeamLevel ? userId : undefined,
                metadata: {
                    integrationId: integration.id,
                    provider: integration.provider,
                    consecutiveErrors: WARNING_THRESHOLD,
                    isTeamLevel,
                },
            })

            logger.info(
                { integrationId: integration.id, provider: integration.provider },
                'integration-health: Stage 1 warning notification queued'
            )
        } catch (err: any) {
            logger.error({ err: err.message, integrationId: integration.id }, 'integration-health: failed to queue warning notification')
        }
    }

    /**
     * Dispatch deactivation notification with Redis dedup key protection
     */
    private async handleDeactivationNotification(
        integration: IntegrationRow,
        teamId?: string,
        userId?: string,
        isTeamLevel = true,
        sanitizedError?: string
    ): Promise<void> {
        const targetId = isTeamLevel ? teamId : userId
        if (!targetId) return

        const dedupKey = `notif:dedup:INTEGRATION_DEACTIVATED:${targetId}:${integration.id}`

        try {
            const acquired = await redis.set(dedupKey, '1', 'EX', DEDUP_TTL_SECONDS, 'NX')
            if (!acquired) {
                logger.info(
                    { integrationId: integration.id, targetId },
                    'integration-health: deactivation notification skipped due to 24h dedup key'
                )
                return
            }

            await notifyQueue.add('send-notification', {
                type: 'INTEGRATION_DEACTIVATED',
                teamId: isTeamLevel ? teamId : undefined,
                ownerId: !isTeamLevel ? userId : undefined,
                metadata: {
                    integrationId: integration.id,
                    provider: integration.provider,
                    consecutiveErrors: DEACTIVATION_THRESHOLD,
                    isTeamLevel,
                    reason: sanitizedError || 'consecutive_failures_exceeded',
                },
            })

            logger.info(
                { integrationId: integration.id, provider: integration.provider },
                'integration-health: Stage 2 deactivation notification queued'
            )
        } catch (err: any) {
            logger.error({ err: err.message, integrationId: integration.id }, 'integration-health: failed to queue deactivation notification')
        }
    }
}

export const integrationHealthService = new IntegrationHealthService()
