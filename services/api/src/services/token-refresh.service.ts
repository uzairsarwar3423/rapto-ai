/**
 * token-refresh.service.ts — Shared access token validation, proactive refresh, and sweep discovery.
 *
 * Day 64 Principal Architecture:
 * - findExpiringIntegrations(): Proactive sweep querying TeamIntegration & UserIntegration rows nearing expiry (within 30 mins).
 *   Excluded by design: rows with tokenExpiresAt: null (Linear, Notion, Slack).
 * - refreshIntegration(): Accepts either a TeamIntegration or UserIntegration row, wraps getValidAccessToken in try/catch,
 *   reporting outcomes directly to integrationHealthService. Does not re-throw outside its boundary.
 * - getValidAccessToken(): Reactive-refresh fallback helper used by action-item and calendar sync flows.
 */

import { prisma } from '../db/client'
import { encrypt, decrypt } from '../utils/crypto'
import { addSeconds } from 'date-fns'
import { getProvider } from '../modules/integrations/providers/provider.registry'
import { TeamProvider } from '@prisma/client'
import { logger } from '../config/logger'
import { AppError } from '../utils/errors'
import { integrationHealthService, IntegrationRow } from './integration-health.service'

export interface ExpiringIntegrationsResult {
    teamIntegrations: Array<{ id: string; provider: string; teamId: string }>
    userIntegrations: Array<{ id: string; provider: string; userId: string }>
}

/**
 * findExpiringIntegrations — scans database for active team and user integrations
 * whose tokens expire within the lookahead window (30 minutes).
 *
 * Excludes rows with tokenExpiresAt: null (Linear, Notion, Slack) automatically.
 */
export async function findExpiringIntegrations(lookaheadMinutes = 30): Promise<ExpiringIntegrationsResult> {
    const lookaheadDate = new Date(Date.now() + lookaheadMinutes * 60 * 1000)

    const teamIntegrations = await prisma.teamIntegration.findMany({
        where: {
            isActive: true,
            tokenExpiresAt: {
                not: null,
                lte: lookaheadDate,
            },
        },
        select: {
            id: true,
            provider: true,
            teamId: true,
        },
    })

    const userIntegrations = await prisma.userIntegration.findMany({
        where: {
            syncEnabled: true,
            tokenExpiresAt: {
                not: null,
                lte: lookaheadDate,
            },
        },
        select: {
            id: true,
            provider: true,
            userId: true,
        },
    })

    logger.info(
        {
            teamCount: teamIntegrations.length,
            userCount: userIntegrations.length,
            lookaheadMinutes,
        },
        'token-refresh.service: findExpiringIntegrations completed'
    )

    return {
        teamIntegrations,
        userIntegrations,
    }
}

/**
 * refreshIntegration — attempts to refresh a single integration's access token,
 * recording outcome (success or failure) in integrationHealthService.
 *
 * Returns a result object and NEVER throws outside its boundary.
 */
export async function refreshIntegration(
    integration: IntegrationRow & { accessTokenEnc?: string; refreshTokenEnc?: string | null; tokenExpiresAt?: Date | null },
    isTeamLevel = false
): Promise<{ success: boolean; error?: string }> {
    const start = Date.now()
    try {
        await getValidAccessToken(integration as any, isTeamLevel)
        await integrationHealthService.recordSuccess(integration)

        logger.info(
            { integrationId: integration.id, provider: integration.provider, latencyMs: Date.now() - start },
            'token-refresh.service: integration refreshed successfully'
        )
        return { success: true }
    } catch (err: any) {
        const errorMsg = err.message || 'Unknown token refresh failure'
        logger.error(
            { integrationId: integration.id, provider: integration.provider, error: errorMsg, latencyMs: Date.now() - start },
            'token-refresh.service: integration refresh failed'
        )

        await integrationHealthService.recordFailure(integration, errorMsg)
        return { success: false, error: errorMsg }
    }
}

/**
 * getValidAccessToken — obtain a valid (possibly just-refreshed) access token.
 *
 * Proactive refresh window: 30 minutes before expiry.
 */
export async function getValidAccessToken(
    integration: IntegrationRow & { accessTokenEnc: string; refreshTokenEnc: string | null; tokenExpiresAt: Date | null },
    isTeamLevel = false
): Promise<string> {
    const now = new Date()
    const expiresAt = integration.tokenExpiresAt

    // Proactive refresh if token expires within 30 minutes (or has no known expiry)
    const needsRefresh = expiresAt && expiresAt.getTime() - now.getTime() < 30 * 60 * 1000

    if (!needsRefresh) {
        return decrypt(integration.accessTokenEnc)
    }

    if (!integration.refreshTokenEnc) {
        throw new AppError(
            'REFRESH_TOKEN_MISSING',
            401,
            'Token is expiring and no refresh token is available — the user must reconnect their integration.'
        )
    }

    const provider = integration.provider

    // ─── Calendar Integrations (user-level or team-level) ────────────────────────
    const calendarProviders = ['GOOGLE_CALENDAR', 'OUTLOOK_CALENDAR']
    if (calendarProviders.includes(provider)) {
        const { calendarProviderRegistry } = await import('../modules/integrations/providers/calendar-provider.registry')
        const providerClient = calendarProviderRegistry.getProvider(provider as any)

        const plainRefreshToken = decrypt(integration.refreshTokenEnc)
        const refreshResult = await providerClient.refreshAccessToken(plainRefreshToken)
        const newAccessTokenEnc = encrypt(refreshResult.accessToken)

        const updateData: any = {
            accessTokenEnc: newAccessTokenEnc,
            tokenExpiresAt: refreshResult.expiresAt ?? null,
            consecutiveErrors: 0,
            lastError: null,
        }
        if (refreshResult.refreshToken) {
            updateData.refreshTokenEnc = encrypt(refreshResult.refreshToken)
        }

        if (isTeamLevel) {
            await prisma.teamIntegration.update({
                where: { id: integration.id },
                data: updateData,
            })
        } else {
            await prisma.userIntegration.update({
                where: { id: integration.id },
                data: updateData,
            })
        }

        return refreshResult.accessToken
    }

    // ─── All team-level providers (JIRA, SLACK, LINEAR, NOTION) ─────────────
    const teamProviders: TeamProvider[] = ['JIRA', 'SLACK', 'LINEAR', 'NOTION']
    if (teamProviders.includes(provider as TeamProvider)) {
        let providerClient
        try {
            providerClient = getProvider(provider as TeamProvider)
        } catch (err) {
            throw new AppError(
                'PROVIDER_NOT_SUPPORTED',
                501,
                `Cannot refresh token for unsupported provider: ${provider}`
            )
        }

        let refreshResult: { accessToken: string; refreshToken?: string; expiresIn?: number }
        try {
            refreshResult = await providerClient.refreshAccessToken(integration.refreshTokenEnc)
        } catch (refreshError: any) {
            logger.error(
                { integrationId: integration.id, provider, err: refreshError.message },
                'token-refresh.service: provider refresh failed'
            )
            throw refreshError
        }

        const newAccessTokenEnc = encrypt(refreshResult.accessToken)
        const newExpiresAt = refreshResult.expiresIn
            ? addSeconds(new Date(), refreshResult.expiresIn)
            : null

        await prisma.teamIntegration.update({
            where: { id: integration.id },
            data: {
                accessTokenEnc: newAccessTokenEnc,
                ...(refreshResult.refreshToken
                    ? { refreshTokenEnc: encrypt(refreshResult.refreshToken) }
                    : {}),
                tokenExpiresAt: newExpiresAt,
                consecutiveErrors: 0,
                lastError: null,
            },
        })

        return refreshResult.accessToken
    }

    throw new AppError(
        'PROVIDER_NOT_SUPPORTED',
        501,
        `Unsupported provider for token refresh: ${provider}`
    )
}

export const tokenRefreshService = {
    findExpiringIntegrations,
    refreshIntegration,
    refreshTeamIntegration: (integration: any) => refreshIntegration(integration, true),
    refreshUserIntegration: (integration: any) => refreshIntegration(integration, false),
    getValidAccessToken,
}

