import { TeamIntegration } from '@prisma/client'
import {
    IntegrationProvider,
    ProviderTestResult,
    CreateExternalItemInput,
    ExternalItemResult,
} from './provider.interface'
import { ProviderTokenResponse, LinearTeamWithStates } from '../integrations.types'
import { OAUTH_CONFIGS } from './oauth-config'
import { encrypt, decrypt } from '../../../utils/crypto'
import { redis } from '../../../config/redis'
import { logger } from '../../../config/logger'
import { AppError, IntegrationError } from '../../../utils/errors'
import { graphqlRequest } from '../../../utils/graphql-client'

// Priority mapping from Vocaply's 4-level enum to Linear's integer scale (1-4)
export const LINEAR_PRIORITY_MAP: Record<string, number> = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    URGENT: 4,
}

// ─────────────────────────────────────────────────────────────────────────────
// Redis key helpers — all Linear-specific keys centralized here
// ─────────────────────────────────────────────────────────────────────────────
const assigneeCacheKey = (teamId: string, email: string) =>
    `cache:linear:assignee:${teamId}:${email}`

const ASSIGNEE_CACHE_TTL = 86400 // 24h
const NEGATIVE_CACHE_SENTINEL = 'NONE'

export class LinearProvider implements IntegrationProvider {
    /**
     * Helper to get OAuth config for Linear
     */
    private getConfig() {
        const config = OAUTH_CONFIGS.LINEAR
        if (!config) throw new AppError('PROVIDER_NOT_CONFIGURED', 500, 'Linear OAuth config missing')
        return config
    }

    /**
     * Builds the Linear authorization URL
     * Called by integrations.service.ts initiateOAuth
     */
    getAuthorizationUrl(state: string, redirectUriOverride?: string): string {
        const config = this.getConfig()
        const params = new URLSearchParams({
            client_id: config.clientId,
            redirect_uri: redirectUriOverride || config.callbackUrl,
            response_type: 'code',
            state,
            scope: config.scopes.join(' '),
            prompt: 'consent',
        })
        return `${config.authUrl}?${params.toString()}`
    }

    // ─────────────────────────────────────────────────────────────────────────
    // OAuth — exchangeCodeForTokens
    // ─────────────────────────────────────────────────────────────────────────
    async exchangeCodeForTokens(code: string): Promise<ProviderTokenResponse> {
        const config = this.getConfig()

        const params = new URLSearchParams()
        params.append('code', code)
        params.append('redirect_uri', config.callbackUrl)
        params.append('client_id', config.clientId)
        params.append('client_secret', config.clientSecret)
        params.append('grant_type', 'authorization_code')

        let response: Response
        try {
            response = await fetch(config.tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString(),
            })
        } catch (error: any) {
            logger.error({ err: error.message }, 'integrate.linear.callback_failed: token exchange network error')
            throw new AppError('LINEAR_AUTH_NETWORK_ERROR', 502, `Linear network error: ${error.message}`)
        }

        if (!response.ok) {
            const bodyText = await response.text()
            logger.error({ status: response.status, body: bodyText }, 'integrate.linear.callback_failed: token exchange HTTP error')
            if (response.status === 400) {
                throw new AppError('LINEAR_AUTH_CODE_INVALID', 400, 'Invalid or expired Linear authorization code')
            }
            throw new IntegrationError('LINEAR', `OAuth exchange failed with status ${response.status}`)
        }

        const data = await response.json() as any
        const access_token = data.access_token

        // Verify connection to get workspace details
        let viewerData: any
        try {
            const viewerRes = await graphqlRequest({
                endpoint: 'https://api.linear.app/graphql',
                headers: { Authorization: `Bearer ${access_token}` },
                query: `query { viewer { id name email organization { id name urlKey } } }`,
                providerName: 'LINEAR',
            })
            viewerData = viewerRes.viewer
        } catch (error: any) {
            logger.error({ err: error.message }, 'integrate.linear.callback_failed: viewer query failed')
            throw new IntegrationError('LINEAR', 'Failed to fetch viewer profile after token exchange')
        }

        return {
            accessToken: access_token,
            // Linear does not expire tokens typically, so refreshToken is null
            expiresIn: data.expires_in,
            workspaceMeta: {
                id: viewerData.organization.id,
                name: viewerData.organization.name,
                url: `https://linear.app/${viewerData.organization.urlKey}`,
            },
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // OAuth — refreshAccessToken (No-op since tokens don't expire for this flow)
    // ─────────────────────────────────────────────────────────────────────────
    async refreshAccessToken(
        refreshTokenEnc: string
    ): Promise<Omit<ProviderTokenResponse, 'workspaceMeta'>> {
        // Not used as we set tokenExpiresAt: null
        throw new AppError('LINEAR_UNSUPPORTED_OPERATION', 500, 'Linear tokens do not require refresh in this implementation')
    }

    // ─────────────────────────────────────────────────────────────────────────
    // testConnection — query viewer profile
    // ─────────────────────────────────────────────────────────────────────────
    async testConnection(integration: TeamIntegration): Promise<ProviderTestResult> {
        try {
            const accessToken = decrypt(integration.accessTokenEnc)
            
            await graphqlRequest({
                endpoint: 'https://api.linear.app/graphql',
                headers: { Authorization: `Bearer ${accessToken}` },
                query: `query { viewer { id name } }`,
                providerName: 'LINEAR',
                timeoutMs: 10000,
            })

            return { healthy: true, workspaceName: integration.workspaceName || undefined }
        } catch (error: any) {
            logger.warn(
                { integrationId: integration.id, err: error.message },
                'Linear testConnection failed'
            )
            return { healthy: false }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // revokeToken — best-effort token revocation
    // ─────────────────────────────────────────────────────────────────────────
    async revokeToken(integration: TeamIntegration): Promise<void> {
        try {
            const accessToken = decrypt(integration.accessTokenEnc)
            const config = this.getConfig()

            const params = new URLSearchParams()
            params.append('token', accessToken)
            params.append('client_id', config.clientId)
            params.append('client_secret', config.clientSecret)

            await fetch('https://api.linear.app/oauth/revoke', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString(),
            })

            logger.info({ integrationId: integration.id }, 'Linear token revoked successfully')
        } catch (error: any) {
            logger.warn(
                { integrationId: integration.id, err: error.message },
                'Linear token revocation failed (best-effort, non-fatal)'
            )
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // listTeamsAndStates
    // ─────────────────────────────────────────────────────────────────────────
    async listTeamsAndStates(accessToken: string): Promise<LinearTeamWithStates[]> {
        const query = `
            query {
                teams {
                    nodes {
                        id
                        name
                        states {
                            nodes {
                                id
                                name
                                type
                            }
                        }
                    }
                }
            }
        `
        const response = await graphqlRequest({
            endpoint: 'https://api.linear.app/graphql',
            headers: { Authorization: `Bearer ${accessToken}` },
            query,
            providerName: 'LINEAR',
        })

        return response.teams.nodes.map((team: any) => ({
            id: team.id,
            name: team.name,
            states: team.states.nodes.map((state: any) => ({
                id: state.id,
                name: state.name,
                type: state.type,
            })),
        }))
    }

    // ─────────────────────────────────────────────────────────────────────────
    // resolveLinearAssignee
    // ─────────────────────────────────────────────────────────────────────────
    async resolveLinearAssignee(
        accessToken: string,
        teamId: string,
        email: string
    ): Promise<string | null> {
        const cacheKey = assigneeCacheKey(teamId, email)

        const cached = await redis.get(cacheKey)
        if (cached !== null) {
            if (cached === NEGATIVE_CACHE_SENTINEL) {
                logger.info({ teamId, email }, 'integrate.linear.assignee_unresolved (negative cache hit)')
                return null
            }
            logger.info({ teamId }, 'integrate.linear.assignee_resolved (cached: true)')
            return cached
        }

        try {
            const query = `
                query Users($email: String!) {
                    users(filter: { email: { eq: $email } }) {
                        nodes {
                            id
                        }
                    }
                }
            `
            const response = await graphqlRequest({
                endpoint: 'https://api.linear.app/graphql',
                headers: { Authorization: `Bearer ${accessToken}` },
                query,
                variables: { email },
                providerName: 'LINEAR',
            })

            const nodes = response.users?.nodes || []
            if (nodes.length === 1) {
                const accountId = nodes[0].id
                await redis.setex(cacheKey, ASSIGNEE_CACHE_TTL, accountId)
                logger.info({ teamId, cached: false }, 'integrate.linear.assignee_resolved')
                return accountId
            }

            if (nodes.length > 1) {
                logger.warn({ teamId, email, count: nodes.length }, 'integrate.linear.assignee_unresolved (multiple matches, treating as none)')
            } else {
                logger.info({ teamId, email }, 'integrate.linear.assignee_unresolved (no match)')
            }

            await redis.setex(cacheKey, ASSIGNEE_CACHE_TTL, NEGATIVE_CACHE_SENTINEL)
            return null
        } catch (error: any) {
            logger.warn(
                { teamId, email, err: error.message },
                'integrate.linear.assignee_unresolved (API error — proceeding unassigned)'
            )
            return null
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // createExternalItem
    // ─────────────────────────────────────────────────────────────────────────
    async createExternalItem(
        integration: TeamIntegration,
        input: CreateExternalItemInput
    ): Promise<ExternalItemResult> {
        const accessToken = decrypt(integration.accessTokenEnc)
        const metadata = integration.metadata as Record<string, any>

        const teamId = metadata?.linearTeamId
        const stateId = metadata?.defaultStateId

        if (!teamId || !stateId) {
            throw new IntegrationError(
                'LINEAR',
                'Linear integration is not fully configured: linearTeamId or defaultStateId is missing.'
            )
        }

        const title = input.text.substring(0, 255)
        
        let description = `**Extracted from meeting:** ${input.context.meetingTitle} on ${input.context.meetingDate.toISOString().split('T')[0]}\n\n`
        if (input.context.transcriptExcerpt) {
            description += `> ${input.context.transcriptExcerpt.trim().substring(0, 500)}\n\n`
        }
        description += `_— Created automatically by Vocaply_`

        const priority = LINEAR_PRIORITY_MAP[input.priority] || 0

        let assigneeId: string | null = null
        if (input.assigneeEmail) {
            assigneeId = await this.resolveLinearAssignee(
                accessToken,
                integration.teamId,
                input.assigneeEmail
            )
        }

        const mutation = `
            mutation CreateIssue($teamId: String!, $title: String!, $description: String, $stateId: String!, $priority: Int, $assigneeId: String, $dueDate: TimelessDate) {
                issueCreate(input: {
                    teamId: $teamId
                    title: $title
                    description: $description
                    stateId: $stateId
                    priority: $priority
                    ${assigneeId ? 'assigneeId: $assigneeId' : ''}
                    ${input.dueDate ? 'dueDate: $dueDate' : ''}
                }) {
                    success
                    issue {
                        id
                        identifier
                        url
                    }
                }
            }
        `

        const variables: Record<string, any> = {
            teamId,
            title,
            description,
            stateId,
            priority,
        }
        if (assigneeId) {
            variables.assigneeId = assigneeId
        }
        if (input.dueDate) {
            variables.dueDate = new Date(input.dueDate).toISOString().split('T')[0]
        }

        const response = await graphqlRequest({
            endpoint: 'https://api.linear.app/graphql',
            headers: { Authorization: `Bearer ${accessToken}` },
            query: mutation,
            variables,
            providerName: 'LINEAR',
        })

        if (response.issueCreate?.success === false) {
            throw new IntegrationError(
                'LINEAR',
                'Linear API rejected the issue creation semantically (success: false). Likely an invalid stateId or revoked permissions.'
            )
        }

        const issue = response.issueCreate?.issue
        if (!issue || !issue.id || !issue.url) {
            throw new IntegrationError(
                'LINEAR',
                'Linear API returned success but issue details were missing.'
            )
        }

        logger.info(
            {
                teamId: integration.teamId,
                actionItemId: input.actionItemId,
                linearIssueId: issue.id,
            },
            'integrate.linear.issue_created'
        )

        return {
            externalId: issue.id,
            externalUrl: issue.url,
        }
    }
}

export const linearProvider = new LinearProvider()
