import { prisma } from '../db/client'
import { encrypt, decrypt } from '../utils/crypto'
import { addMinutes, addSeconds } from 'date-fns'
import { googleCalendarProvider } from '../modules/integrations/providers/google-calendar.provider'

export async function getValidAccessToken(
    integration: {
        id: string
        provider: string
        accessTokenEnc: string
        refreshTokenEnc: string | null
        tokenExpiresAt: Date | null
        consecutiveErrors: number
    },
    isTeamLevel = false
): Promise<string> {
    const now = new Date()
    const expiresAt = integration.tokenExpiresAt

    // Proactive refresh if token expires within 30 minutes
    const needsRefresh = expiresAt && expiresAt.getTime() - now.getTime() < 30 * 60 * 1000

    if (!needsRefresh) {
        return decrypt(integration.accessTokenEnc)
    }

    if (!integration.refreshTokenEnc) {
        throw new Error('Token is expiring and no refresh token is available — user must reconnect')
    }

    const refreshToken = decrypt(integration.refreshTokenEnc)

    if (integration.provider === 'GOOGLE_CALENDAR') {
        // We know it's google calendar right now
        const refreshResult = await googleCalendarProvider.refreshAccessToken(refreshToken)
        const newAccessTokenEnc = encrypt(refreshResult.accessToken)
        // refreshResult.expiresAt is already a Date object

        if (isTeamLevel) {
            await prisma.teamIntegration.update({
                where: { id: integration.id },
                data: {
                    accessTokenEnc: newAccessTokenEnc,
                    tokenExpiresAt: refreshResult.expiresAt,
                    consecutiveErrors: 0, // Reset errors on success
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

    throw new Error(`Unsupported provider for token refresh: ${integration.provider}`)
}
