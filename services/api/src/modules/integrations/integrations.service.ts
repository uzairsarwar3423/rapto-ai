import { ProviderType } from './integrations.types'
import { integrationsRepository } from './integrations.repository'
import { OAuthStateService } from './providers/oauth-state.service'
import { OAUTH_CONFIGS } from './providers/oauth-config'
import { jiraProvider } from './providers/jira.provider'
import { slackProvider } from './providers/slack.provider'
import { linearProvider } from './providers/linear.provider'
import { notionProvider } from './providers/notion.provider'
import { getProvider } from './providers/provider.registry'
import { AppError } from '../../utils/errors'
import { encrypt, decrypt } from '../../utils/crypto'
import { redis } from '../../config/redis'
import { getIO } from '../../realtime/socket.server'
import { SERVER_EVENTS } from '../../realtime/socket.events'
import { teamRoom } from '../../realtime/rooms.manager'
import { addSeconds } from 'date-fns'
import { env } from '../../config/env'
import { logger } from '../../config/logger'

// ─────────────────────────────────────────────────────────────────────────────
// resolveProvider — the SINGLE place in this service that changed on Day 22.
//
// RULE (from Day 21 design): Provider files NEVER import integrations.service.ts.
// The service calls INTO providers. This rule is what makes today's three new
// providers pure ADDITIONS rather than requiring changes elsewhere.
//
// Confirmed via diff: only this switch gained new cases. Zero other changes
// to this file's logic were required — proving Day 21's architecture paid off.
// ─────────────────────────────────────────────────────────────────────────────

export function resolveProvider(provider: ProviderType) {
    switch (provider) {
        case 'JIRA':
            return jiraProvider
        case 'SLACK':
            return slackProvider
        case 'LINEAR':
            return linearProvider
        case 'NOTION':
            return notionProvider
        default:
            throw new AppError('UNSUPPORTED_PROVIDER', 400, 'Unsupported provider')
    }
}

export class IntegrationsService {
    async listIntegrations(teamId: string) {
        const cacheKey = `cache:team:integrations:${teamId}`
        const cached = await redis.get(cacheKey)
        if (cached) return JSON.parse(cached)

        const list = await integrationsRepository.findAllByTeam(teamId)
        await redis.setex(cacheKey, 300, JSON.stringify(list))
        return list
    }

    async initiateOAuth(provider: ProviderType, teamId: string, userId: string) {
        const allowedProviders: ProviderType[] = ['JIRA', 'LINEAR', 'SLACK', 'NOTION']
        if (!allowedProviders.includes(provider)) {
            throw new AppError('INVALID_PROVIDER', 422, 'Invalid provider')
        }

        const config = OAUTH_CONFIGS[provider]
        if (!config) {
            throw new AppError('PROVIDER_NOT_CONFIGURED', 422, `Provider ${provider} is not configured`)
        }

        const state = await OAuthStateService.generateState(provider, teamId, userId)

        let authUrl = `${config.authUrl}?client_id=${config.clientId}&response_type=code&redirect_uri=${encodeURIComponent(config.callbackUrl)}&state=${state}&scope=${encodeURIComponent(config.scopes.join(' '))}`

        if (config.extraParams) {
            for (const [k, v] of Object.entries(config.extraParams)) {
                authUrl += `&${k}=${encodeURIComponent(v)}`
            }
        }

        return { authUrl }
    }

    async handleOAuthCallback(provider: ProviderType, code: string, state: string) {
        const consumed = await OAuthStateService.consumeState(state)
        if (!consumed) throw new AppError('OAUTH_INVALID_STATE', 400, 'Invalid state parameter')
        if (consumed.provider !== provider) throw new AppError('OAUTH_PROVIDER_MISMATCH', 400, 'Provider mismatch')

        logger.info({ provider, teamId: consumed.teamId, userId: consumed.userId }, `integrate.${provider.toLowerCase()}.connect_initiated`)

        const providerClient = resolveProvider(provider)
        let tokenResponse
        try {
            tokenResponse = await providerClient.exchangeCodeForTokens(code)
        } catch (e: any) {
            logger.error({ err: e.message, provider, teamId: consumed.teamId }, `integrate.${provider.toLowerCase()}.callback_failed`)
            throw new AppError('PROVIDER_TOKEN_EXCHANGE_FAILED', 502, 'Provider token exchange failed')
        }

        const encryptedAccess = encrypt(tokenResponse.accessToken)
        const encryptedRefresh = tokenResponse.refreshToken ? encrypt(tokenResponse.refreshToken) : null
        const tokenExpiresAt = tokenResponse.expiresIn ? addSeconds(new Date(), tokenResponse.expiresIn) : null

        // ─────────────────────────────────────────────────────────────────────
        // CRITICAL (Day 58 §18 — upsert-merge, not blind overwrite):
        //
        // When an admin reconnects after a NEEDS_RECONNECT state, the upsert MUST
        // preserve the already-configured metadata.projectKey / defaultIssueType.
        // Only token fields and isActive / consecutiveErrors should reset.
        //
        // A naive upsert that replaces the entire metadata object with a fresh {}
        // would silently un-configure a previously-working integration on every
        // reconnect, forcing the admin to redo project configuration — called out
        // explicitly as a test case in §27.
        //
        // Implementation: load existing metadata first, then merge the new provider
        // extras ON TOP of it (existing config wins for non-token keys).
        // ─────────────────────────────────────────────────────────────────────
        const existing = await integrationsRepository.findByTeamAndProvider(consumed.teamId, provider)
        const existingMetadata = (existing?.metadata as Record<string, unknown>) ?? {}
        const newProviderExtras = tokenResponse.workspaceMeta.extra
            ? (tokenResponse.workspaceMeta.extra as Record<string, unknown>)
            : {}

        // Merge order: existing config first, new extras override only their own keys.
        // This preserves projectKey/defaultIssueType while updating cloudId on reconnect.
        const mergedMetadata = { ...existingMetadata, ...newProviderExtras }

        // ─────────────────────────────────────────────────────────────────────
        // Day 59 §6: Jira Webhook Registration (connect flow)
        //
        // MUST happen BEFORE the upsert so that the returned { webhookId, secret }
        // is included in the SAME database write. This keeps the connect flow atomic:
        // either tokens + cloudId + webhook registration are ALL persisted, or none.
        //
        // RECONNECT GUARD (§17): If an existing integration already has a
        // jiraWebhookId in metadata, skip re-registration — the original webhook
        // subscription almost certainly survived the OUTBOUND-sync-failure auto-
        // disable that triggered the reconnect, and creating a second one would leave
        // a stale, unreferenced webhook on Jira's side.
        // ─────────────────────────────────────────────────────────────────────
        if (provider === 'JIRA') {
            const cloudId = mergedMetadata['cloudId'] as string | undefined
            const projectKey = mergedMetadata['projectKey'] as string | undefined
            const existingWebhookId = existingMetadata['jiraWebhookId'] as string | undefined

            if (cloudId && projectKey && !existingWebhookId) {
                // Fresh connection (no existing webhook) — register one now.
                const apiBase = env.API_URL || env.APP_URL
                const callbackBase = `${apiBase}/webhooks/jira`

                const { webhookId, secret } = await jiraProvider.registerWebhook({
                    accessToken: tokenResponse.accessToken,
                    cloudId,
                    projectKey,
                    teamId:       consumed.teamId,
                    callbackBase,
                })

                // Encrypt the per-team secret (§18: signing key = token-grade protection)
                const { encrypt: encryptSecret } = await import('../../utils/crypto')
                mergedMetadata['jiraWebhookId']     = webhookId
                mergedMetadata['jiraWebhookSecret'] = encryptSecret(secret)

                logger.info(
                    { provider, teamId: consumed.teamId, webhookId },
                    'integrations.jira.webhook_registered (connect flow)'
                )
            } else if (existingWebhookId) {
                // Reconnect guard — existing webhook survives; skip re-registration.
                logger.info(
                    { provider, teamId: consumed.teamId, existingWebhookId },
                    'integrations.jira: skipping webhook re-registration on reconnect — existing webhookId preserved'
                )
            } else if (!projectKey) {
                // Integration connected without a projectKey configured yet (admin
                // must still configure via PATCH /integrations/JIRA/config).
                // Webhook registration is deferred until configure is called.
                logger.info(
                    { provider, teamId: consumed.teamId },
                    'integrations.jira: no projectKey configured yet — webhook registration deferred until project is configured'
                )
            }
        }

        await integrationsRepository.upsert(consumed.teamId, provider, {
            accessTokenEnc: encryptedAccess,
            refreshTokenEnc: encryptedRefresh,
            tokenExpiresAt,
            workspaceId: tokenResponse.workspaceMeta.id,
            workspaceName: tokenResponse.workspaceMeta.name,
            workspaceUrl: tokenResponse.workspaceMeta.url,
            metadata: mergedMetadata,
            isActive: true,
            consecutiveErrors: 0,
            connectedById: consumed.userId,
        })

        await redis.del(`cache:team:integrations:${consumed.teamId}`)
        try {
            getIO().to(teamRoom(consumed.teamId)).emit(SERVER_EVENTS.INTEGRATION_CONNECTED, {
                provider,
                workspaceName: tokenResponse.workspaceMeta.name,
            })
        } catch (err) {
            logger.warn({ err }, 'integrations.service: Socket.io emit failed (non-fatal)')
        }

        logger.info({ provider, teamId: consumed.teamId }, `integrate.${provider.toLowerCase()}.connected`)

        return {
            redirectUrl: `${env.FRONTEND_URL}/settings/integrations?connected=${provider.toLowerCase()}`,
        }
    }

    async disconnectIntegration(teamId: string, provider: ProviderType, requesterId: string) {
        const integration = await integrationsRepository.findByTeamAndProvider(teamId, provider)
        if (!integration) throw new AppError('NOT_FOUND', 404, 'Integration not found')

        // ─────────────────────────────────────────────────────────────────────
        // Day 59 §7: Jira Webhook Deregistration (disconnect flow)
        //
        // Called BEFORE markDisconnected() (row still present → metadata still readable).
        // Mirrors the ordering for OAuth token revocation: "undo third-party side effect
        // FIRST, delete local record SECOND." (Principle 3, Day 59 §2)
        // ─────────────────────────────────────────────────────────────────────
        if (provider === 'JIRA') {
            const meta = (integration.metadata as Record<string, any>) ?? {}
            const webhookId = meta['jiraWebhookId'] as string | undefined
            const cloudId   = (meta['cloudId'] || integration.workspaceId) as string | undefined

            if (webhookId && cloudId) {
                try {
                    const accessToken = decrypt(integration.accessTokenEnc)
                    await jiraProvider.deregisterWebhook({
                        accessToken,
                        cloudId,
                        webhookId,
                        teamId,
                    })
                } catch (deregErr: any) {
                    // deregisterWebhook() already handles 404-as-success and WARN-only failures.
                    // This outer catch is a belt-and-suspenders guard — should never trigger.
                    logger.warn(
                        { teamId, webhookId, err: deregErr.message },
                        'integrations.jira.webhook_deregistration_failed (outer catch) — disconnect proceeding'
                    )
                }
            } else {
                logger.info(
                    { teamId, hasWebhookId: !!webhookId, hasCloudId: !!cloudId },
                    'integrations.jira: no webhookId or cloudId in metadata — skipping deregistration'
                )
            }
        }

        const providerClient = resolveProvider(provider)
        await providerClient.revokeToken(integration) // Best effort, swallows errors inside provider

        await integrationsRepository.markDisconnected(integration.id, requesterId)
        await redis.del(`cache:team:integrations:${teamId}`)
        try {
            getIO().to(teamRoom(teamId)).emit(SERVER_EVENTS.INTEGRATION_DISCONNECTED, { provider })
        } catch (err) {
            logger.warn({ err }, 'integrations.service: Socket.io disconnect emit failed (non-fatal)')
        }

        return { message: 'Disconnected', provider }
    }

    async testConnection(teamId: string, provider: ProviderType) {
        const integration = await integrationsRepository.findByTeamAndProvider(teamId, provider)
        if (!integration || !integration.isActive) {
            throw new AppError('INTEGRATION_NOT_CONNECTED', 422, 'Integration not connected')
        }

        const providerClient = resolveProvider(provider)
        const result = await providerClient.testConnection(integration)

        if (result.healthy) {
            await integrationsRepository.resetErrorCount(integration.id)
        } else {
            await integrationsRepository.incrementErrorCount(integration.id)
        }

        return { healthy: result.healthy, workspaceName: result.workspaceName, lastChecked: new Date() }
    }

    /**
     * ensureValidTeamToken — thin wrapper delegating to the shared
     * getValidAccessToken() helper (token-refresh.service.ts). Kept for
     * backward-compat with getProviderOptions() which still calls this.
     *
     * New code should call getValidAccessToken() directly.
     */
    async ensureValidTeamToken(integration: any): Promise<string> {
        const { getValidAccessToken } = await import('../../services/token-refresh.service')
        return getValidAccessToken(integration, true /* isTeamLevel */)
    }

    /**
     * getJiraProjects — fetches the team's Jira projects for the configuration dropdown.
     * Called by GET /integrations/jira/projects (Day 58 §13, §24).
     * Returns a simplified { key, name }[] — avoids the heavyweight getProviderOptions()
     * generic branch that also handles Slack/Linear/Notion differently.
     */
    async getJiraProjects(teamId: string): Promise<Array<{ key: string; name: string }>> {
        const integration = await integrationsRepository.findByTeamAndProvider(teamId, 'JIRA')

        if (!integration || !integration.isActive) {
            throw new AppError('INTEGRATION_NOT_CONNECTED', 422, 'Jira integration is not connected or inactive.')
        }

        const metadata = integration.metadata as Record<string, any>
        const cloudId = metadata?.cloudId || integration.workspaceId

        if (!cloudId) {
            throw new AppError(
                'JIRA_NO_ACCESSIBLE_SITES',
                422,
                'Jira cloudId is missing — the integration must be reconnected.'
            )
        }

        const accessToken = await this.ensureValidTeamToken(integration)
        return jiraProvider.listProjects(accessToken, cloudId)
    }

    async listLinearTeamsAndStates(teamId: string) {
        const integration = await integrationsRepository.findByTeamAndProvider(teamId, 'LINEAR')

        if (!integration || !integration.isActive) {
            throw new AppError('INTEGRATION_NOT_CONNECTED', 422, 'Linear integration is not connected.')
        }

        const accessToken = await this.ensureValidTeamToken(integration)
        return linearProvider.listTeamsAndStates(accessToken)
    }


    async updateConfig(teamId: string, provider: ProviderType, config: Record<string, any>) {
        const { prisma } = await import('../../db/client')
        const integration = await integrationsRepository.findByTeamAndProvider(teamId, provider)
        if (!integration) {
            throw new AppError('INTEGRATION_NOT_FOUND', 404, 'Integration not found')
        }

        const currentMetadata = (integration.metadata as Record<string, any>) || {}
        const updatedMetadata = { ...currentMetadata, ...config }

        // ─────────────────────────────────────────────────────────────────────
        // Day 59 deferred webhook registration:
        // If a projectKey is being set for the FIRST TIME (no prior projectKey
        // and no existing webhookId), register the webhook now.
        // This handles teams that connected before the project was configured.
        // ─────────────────────────────────────────────────────────────────────
        if (
            provider === 'JIRA' &&
            config['projectKey'] &&
            !currentMetadata['projectKey'] &&
            !currentMetadata['jiraWebhookId'] &&
            integration.isActive
        ) {
            try {
                const cloudId = (currentMetadata['cloudId'] || integration.workspaceId) as string
                const accessToken = await this.ensureValidTeamToken(integration)
                const apiBase = env.API_URL || env.APP_URL
                const callbackBase = `${apiBase}/webhooks/jira`

                const { webhookId, secret } = await jiraProvider.registerWebhook({
                    accessToken,
                    cloudId,
                    projectKey: config['projectKey'] as string,
                    teamId,
                    callbackBase,
                })

                const { encrypt: encryptSecret } = await import('../../utils/crypto')
                updatedMetadata['jiraWebhookId']     = webhookId
                updatedMetadata['jiraWebhookSecret'] = encryptSecret(secret)

                logger.info(
                    { teamId, webhookId, projectKey: config['projectKey'] },
                    'integrations.jira.webhook_registered (deferred, triggered by project config)'
                )
            } catch (regErr: any) {
                // Webhook registration failure during config update is a WARN, not a
                // hard failure — the config update still succeeds (the team can still
                // use the outbound sync direction; inbound will be unavailable until
                // they reconnect and registration succeeds).
                logger.warn(
                    { teamId, err: regErr.message },
                    'integrations.jira: deferred webhook registration failed during project config update — ' +
                    'inbound reverse-sync will be unavailable until reconnect'
                )
            }
        }

        await prisma.teamIntegration.update({
            where: { id: integration.id },
            data: { metadata: updatedMetadata }
        })

        await redis.del(`cache:team:integrations:${teamId}`)

        return { success: true, metadata: updatedMetadata }
    }

    async getProviderOptions(teamId: string, provider: ProviderType) {
        const axios = (await import('axios')).default
        const integration = await integrationsRepository.findByTeamAndProvider(teamId, provider)
        if (!integration || !integration.isActive) {
            throw new AppError('INTEGRATION_NOT_CONNECTED', 422, 'Integration not connected')
        }

        const accessToken = await this.ensureValidTeamToken(integration)

        try {
            switch (provider) {
                case 'JIRA': {
                    const response = await axios.get(`https://api.atlassian.com/ex/jira/${integration.workspaceId}/rest/api/3/project`, {
                        headers: { Authorization: `Bearer ${accessToken}` },
                        timeout: 10000
                    })
                    return {
                        options: response.data.map((p: any) => ({
                            id: p.key,
                            name: `${p.name} (${p.key})`
                        }))
                    }
                }
                case 'SLACK': {
                    const response = await axios.get('https://slack.com/api/conversations.list', {
                        headers: { Authorization: `Bearer ${accessToken}` },
                        params: { types: 'public_channel,private_channel', limit: 1000 },
                        timeout: 10000
                    })
                    if (!response.data.ok) throw new Error(response.data.error || 'Slack API error')
                    return {
                        options: response.data.channels.map((c: any) => ({
                            id: c.id,
                            name: `#${c.name}`
                        }))
                    }
                }
                case 'LINEAR': {
                    const response = await axios.post('https://api.linear.app/graphql', {
                        query: `query { teams { nodes { id name key } } }`
                    }, {
                        headers: { Authorization: accessToken },
                        timeout: 10000
                    })
                    if (response.data.errors) throw new Error(response.data.errors[0]?.message || 'Linear API error')
                    return {
                        options: response.data.data.teams.nodes.map((t: any) => ({
                            id: t.id,
                            name: `${t.name} (${t.key})`
                        }))
                    }
                }
                case 'NOTION': {
                    const response = await axios.post('https://api.notion.com/v1/search', {
                        filter: { property: 'object', value: 'database' },
                        page_size: 100
                    }, {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            'Notion-Version': '2022-06-28'
                        },
                        timeout: 10000
                    })
                    return {
                        options: response.data.results.map((db: any) => ({
                            id: db.id,
                            name: db.title?.[0]?.plain_text || 'Untitled Database'
                        }))
                    }
                }
                default:
                    throw new AppError('UNSUPPORTED_PROVIDER', 400, 'Unsupported provider')
            }
        } catch (e: any) {
            logger.error({ error: e.message, provider, teamId }, 'Failed to fetch options from provider API')
            throw new AppError('PROVIDER_API_ERROR', 502, `Failed to retrieve options: ${e.message}`)
        }
    }

    async testCalendarConnection(userId: string, provider: 'GOOGLE_CALENDAR' | 'OUTLOOK_CALENDAR') {
        const { prisma } = await import('../../db/client')
        const { googleCalendarProvider } = await import('./providers/google-calendar.provider')
        const integration = await prisma.userIntegration.findUnique({
            where: { userId_provider: { userId, provider } }
        })
        if (!integration) throw new AppError('INTEGRATION_NOT_CONNECTED', 422, 'Calendar not connected')

        let plainAccessToken: string
        try {
            const { decrypt, encrypt } = await import('../../utils/crypto')
            const now = new Date()
            if (integration.tokenExpiresAt && integration.tokenExpiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
                if (!integration.refreshTokenEnc) throw new Error('No refresh token')
                const refreshResult = await googleCalendarProvider.refreshAccessToken(integration.refreshTokenEnc)
                const newAccessTokenEnc = encrypt(refreshResult.accessToken)
                const newExpiresAt = refreshResult.expiresAt
                await prisma.userIntegration.update({
                    where: { id: integration.id },
                    data: { accessTokenEnc: newAccessTokenEnc, tokenExpiresAt: newExpiresAt }
                })
                plainAccessToken = refreshResult.accessToken
            } else {
                plainAccessToken = decrypt(integration.accessTokenEnc)
            }
        } catch (refreshErr: any) {
            await prisma.userIntegration.update({
                where: { id: integration.id },
                data: { consecutiveErrors: { increment: 1 }, lastError: refreshErr.message }
            })
            return { healthy: false, lastChecked: new Date(), error: refreshErr.message }
        }

        const testResult = await googleCalendarProvider.testConnection(plainAccessToken)
        if (testResult.healthy) {
            await prisma.userIntegration.update({
                where: { id: integration.id },
                data: { consecutiveErrors: 0, lastError: null }
            })
        } else {
            await prisma.userIntegration.update({
                where: { id: integration.id },
                data: { consecutiveErrors: { increment: 1 }, lastError: 'API call failed' }
            })
        }
        return { healthy: testResult.healthy, lastChecked: new Date() }
    }

    async completeCalendarConnect(userId: string, provider: 'GOOGLE_CALENDAR' | 'OUTLOOK_CALENDAR', code: string) {
        const { prisma } = await import('../../db/client')
        const { calendarProviderRegistry } = await import('./providers/calendar-provider.registry')
        const { encrypt } = await import('../../utils/crypto')

        const providerClient = calendarProviderRegistry.getProvider(provider)

        // 1. Exchange code for tokens
        const tokenResponse = await providerClient.exchangeCodeForTokens(code)

        // 2. Fetch primary calendar id (currently only Google needs to fetch lists explicitly, Outlook uses default endpoint)
        let calendarId = 'primary'
        if (provider === 'GOOGLE_CALENDAR') {
            try {
                // We cast since this is a Google-specific method
                const googleClient = providerClient as any
                const calendars = await googleClient.getUserCalendarList(tokenResponse.accessToken)
                const primary = calendars.find((c: any) => c.primary)
                if (primary) {
                    calendarId = primary.id
                }
            } catch (err: any) {
                logger.warn({ userId, err: err.message }, 'Failed to fetch calendar list during connect, falling back to primary')
            }
        }

        // 3. Encrypt tokens
        const accessTokenEnc = encrypt(tokenResponse.accessToken)
        const refreshTokenEnc = tokenResponse.refreshToken ? encrypt(tokenResponse.refreshToken) : null
        
        // 4. Enforce Single-Active-Calendar-Provider rule
        // Before upserting the new one, disable any other active calendar providers
        await prisma.userIntegration.updateMany({
            where: {
                userId,
                provider: { not: provider },
                syncEnabled: true
            },
            data: { syncEnabled: false }
        })

        // 5. Upsert UserIntegration
        const integration = await prisma.userIntegration.upsert({
            where: {
                userId_provider: {
                    userId,
                    provider,
                },
            },
            create: {
                userId,
                provider,
                accessTokenEnc,
                refreshTokenEnc,
                tokenExpiresAt: tokenResponse.expiresAt || null,
                calendarId,
                syncEnabled: true,
            },
            update: {
                accessTokenEnc,
                ...(refreshTokenEnc && { refreshTokenEnc }),
                tokenExpiresAt: tokenResponse.expiresAt || null,
                calendarId,
                syncEnabled: true,
                consecutiveErrors: 0,
                lastError: null,
            },
        })

        return integration
    }

    async disconnectCalendar(userId: string, provider: 'GOOGLE_CALENDAR' | 'OUTLOOK_CALENDAR') {
        const { prisma } = await import('../../db/client')
        const { calendarProviderRegistry } = await import('./providers/calendar-provider.registry')
        const { decrypt } = await import('../../utils/crypto')

        const integration = await prisma.userIntegration.findUnique({
            where: { userId_provider: { userId, provider } }
        })
        if (!integration) throw new AppError('NOT_FOUND', 404, 'Integration not found')

        let plainAccessToken = ''
        try {
            plainAccessToken = decrypt(integration.accessTokenEnc)
        } catch (err: any) {
            logger.warn({ userId, err: err.message }, 'Failed to decrypt access token during disconnect')
        }

        if (plainAccessToken) {
            try {
                const providerClient = calendarProviderRegistry.getProvider(provider)
                await providerClient.revokeToken(plainAccessToken)
            } catch (e: any) {
                logger.warn({ err: e.message }, 'Failed to revoke token remotely during disconnect')
            }
        }

        await prisma.userIntegration.delete({
            where: { id: integration.id }
        })

        return { message: 'Disconnected', provider }
    }

    async updateCalendarConfig(userId: string, provider: 'GOOGLE_CALENDAR' | 'OUTLOOK_CALENDAR', config: Record<string, any>) {
        const { prisma } = await import('../../db/client')
        const integration = await prisma.userIntegration.findUnique({
            where: { userId_provider: { userId, provider } }
        })
        if (!integration) {
            throw new AppError('INTEGRATION_NOT_FOUND', 404, 'Integration not found')
        }

        const updated = await prisma.userIntegration.update({
            where: { id: integration.id },
            data: config
        })

        return { success: true, integration: updated }
    }

    async getCalendarPreview(userId: string) {
        const { prisma } = await import('../../db/client')
        const { integrationsRepository } = await import('./integrations.repository')
        const { calendarProviderRegistry } = await import('./providers/calendar-provider.registry')
        
        const integration = await integrationsRepository.findActiveCalendarIntegration(userId)
        if (!integration) {
            return { events: [] }
        }

        let plainAccessToken: string
        try {
            const { getValidAccessToken } = await import('../../services/token-refresh.service')
            plainAccessToken = await getValidAccessToken(integration, false)
        } catch (err: any) {
            return { events: [], error: `Failed to authenticate: ${err.message}` }
        }

        try {
            const providerClient = calendarProviderRegistry.getProvider(integration.provider)
            const eventsResult = await providerClient.listEvents(plainAccessToken, {
                calendarId: integration.calendarId || 'primary'
            })

            const processedEvents = eventsResult.events.map(event => {
                const isCancelled = event.status === 'cancelled'
                const { platform } = await import('../../utils/platform-detect')
                
                return {
                    id: event.id || '',
                    summary: event.summary || 'Untitled Meeting',
                    start: event.startTime.toISOString(),
                    end: event.startTime.toISOString(),
                    location: event.location || null,
                    meetingUrl: event.meetingUrl || null,
                    platform: event.meetingUrl ? platform(event.meetingUrl).platform : null,
                    isValid: !!event.meetingUrl
                }
            })

            return { events: processedEvents }
        } catch (e: any) {
            logger.error({ userId, error: e.message }, 'Failed to fetch calendar preview')
            return { events: [], error: e.message }
        }
    }
}

export const integrationsService = new IntegrationsService()

