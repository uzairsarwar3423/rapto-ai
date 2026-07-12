/**
 * token-refresh.service.ts — Shared access token validation and proactive refresh.
 *
 * Day 56 origin: Built for Google Calendar (user_integrations).
 * Day 58 extension: Generalized to support ALL team-level integrations via the
 *   provider registry. Jira is the second provider, proving the design generalizes.
 *
 * CRITICAL ASYMMETRY handled here:
 *   Google Calendar (Day 56): refreshAccessToken() does NOT return a new refresh token.
 *   Jira (Day 58):            refreshAccessToken() ALWAYS returns a new refresh token.
 *
 * The conditional-spread pattern below handles both correctly without an
 * `if (provider === 'JIRA')` branch — the DATA (whether refreshed.refreshToken is
 * present) drives the behavior, not a provider-name check. This is Principle 2
 * (§2) preserved even inside this cross-provider shared utility.
 */

import { prisma } from '../db/client'
import { encrypt, decrypt } from '../utils/crypto'
import { addSeconds } from 'date-fns'
import { googleCalendarProvider } from '../modules/integrations/providers/google-calendar.provider'
import { getProvider } from '../modules/integrations/providers/provider.registry'
import { TeamProvider } from '@prisma/client'
import { logger } from '../config/logger'
import { AppError } from '../utils/errors'

// Integration shape accepted by this helper — deliberately minimal to allow
// use with both TeamIntegration and UserIntegration rows.
interface IntegrationRecord {
    id: string
    provider: string
    accessTokenEnc: string
    refreshTokenEnc: string | null
    tokenExpiresAt: Date | null
    consecutiveErrors: number
}

/**
 * getValidAccessToken — obtain a valid (possibly just-refreshed) access token.
 *
 * Proactive refresh window: 30 minutes before expiry.
 * This prevents requests from failing mid-flight due to a token expiring
 * between the "check" and the "use" window.
 *
 * @param integration - The integration record (team or user level)
 * @param isTeamLevel - true → update teamIntegration table; false → userIntegration table
 * @returns decrypted access token string, valid for at least ~30 minutes
 */
export async function getValidAccessToken(
    integration: IntegrationRecord,
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

    // ─── Google Calendar (user-level) ─────────────────────────────────────────
    if (provider === 'GOOGLE_CALENDAR') {
        const plainRefreshToken = decrypt(integration.refreshTokenEnc)
        const refreshResult = await googleCalendarProvider.refreshAccessToken(plainRefreshToken)
        const newAccessTokenEnc = encrypt(refreshResult.accessToken)

        if (isTeamLevel) {
            await prisma.teamIntegration.update({
                where: { id: integration.id },
                data: {
                    accessTokenEnc: newAccessTokenEnc,
                    tokenExpiresAt: refreshResult.expiresAt,
                    consecutiveErrors: 0,
                },
            })
        } else {
            await prisma.userIntegration.update({
                where: { id: integration.id },
                data: {
                    accessTokenEnc: newAccessTokenEnc,
                    tokenExpiresAt: refreshResult.expiresAt,
                    consecutiveErrors: 0,
                },
            })
        }

        return refreshResult.accessToken
    }

    // ─── All team-level providers (JIRA, SLACK, LINEAR, NOTION) ─────────────
    // These are handled via the provider registry — no provider-name branching
    // inside this function. The DATA (whether refreshed.refreshToken is present)
    // drives the update, not a conditional branch on provider name.
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

        // Conditional-spread: only update refreshTokenEnc if the provider returned a new one.
        // Jira ALWAYS returns a new refresh token (the old one is invalidated).
        // Google Calendar NEVER returns one on refresh.
        // This single update handles both correctly without branching on provider name.
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
