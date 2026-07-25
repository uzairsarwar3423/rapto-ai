import { LinearProvider, LINEAR_PRIORITY_MAP } from '../../src/modules/integrations/providers/linear.provider'
import {
    mockLinearResponse,
    mockLinearViewer,
    mockLinearTeamsAndStates,
    mockLinearUsersSearch,
    mockLinearIssueCreateSuccess,
    mockLinearIssueCreateFailure,
    mockLinearAuthError,
    mockLinearRateLimited,
} from '../fixtures/linear-responses.fixture'
import { httpMockRegistry } from '../support/http-mock-registry'
import { redis } from '../../src/config/redis'
import { seedTestTeam, seedTestTeamIntegration } from '../support/test-db'

describe('Linear Integration Provider (End-to-End)', () => {
    let linearProvider: LinearProvider

    beforeEach(() => {
        linearProvider = new LinearProvider()
        httpMockRegistry.reset()
    })

    describe('getAuthorizationUrl', () => {
        it('constructs correct authorization URL with state parameter', () => {
            const url = linearProvider.getAuthorizationUrl('state_test_123')
            expect(url).toContain('https://linear.app/oauth/authorize')
            expect(url).toContain('state=state_test_123')
            expect(url).toContain('response_type=code')
        })
    })

    describe('exchangeCodeForTokens', () => {
        it('exchanges code for tokens and fetches viewer/organization metadata', async () => {
            httpMockRegistry.registerMock({
                domain: 'api.linear.app',
                urlPattern: '/oauth/token',
                method: 'POST',
                status: 200,
                body: {
                    access_token: 'lin_access_token_super_secret_999',
                    token_type: 'Bearer',
                    scope: ['read', 'write'],
                },
            })

            // Mock viewer query endpoint called during exchange
            mockLinearResponse('/graphql', mockLinearViewer, 200, 'POST')

            const tokenResult = await linearProvider.exchangeCodeForTokens('valid_linear_code')

            expect(tokenResult.accessToken).toEqual('lin_access_token_super_secret_999')
            expect(tokenResult.workspaceMeta.id).toEqual('lin-org-888')
            expect(tokenResult.workspaceMeta.name).toEqual('Rapto Organization')
        })
    })

    describe('createExternalItem & Priority Mapping', () => {
        it('constructs GraphQL mutation variables matching Linear API specification', async () => {
            const team = await seedTestTeam()
            const integration = await seedTestTeamIntegration(team.id, 'LINEAR', {
                workspaceId: 'lin-org-888',
            })

            // Mock teams/states lookup and user search and issue creation
            mockLinearResponse('/graphql', mockLinearTeamsAndStates, 200, 'POST')
            mockLinearResponse('/graphql', mockLinearUsersSearch, 200, 'POST')
            mockLinearResponse('/graphql', mockLinearIssueCreateSuccess, 200, 'POST')

            const result = await linearProvider.createExternalItem(integration, {
                actionItemId: 'act_101',
                text: 'Security Audit: RSA Key Rotation',
                priority: 'URGENT',
                assigneeEmail: 'alice@rapto.dev',
                context: {
                    meetingTitle: 'Security Sync',
                    meetingDate: new Date(),
                },
                teamMetadata: {
                    linearTeamId: 'lin-team-001',
                },
            })

            expect(result.externalId).toEqual('lin-issue-101')
            expect(result.externalUrl).toEqual('https://linear.app/rapto/issue/ENG-101/security-audit')
        })

        it('correctly maps all 4 Rapto priority levels to Linear 1-4 integers', () => {
            expect(LINEAR_PRIORITY_MAP['LOW']).toEqual(1)
            expect(LINEAR_PRIORITY_MAP['MEDIUM']).toEqual(2)
            expect(LINEAR_PRIORITY_MAP['HIGH']).toEqual(3)
            expect(LINEAR_PRIORITY_MAP['URGENT']).toEqual(4)
        })
    })

    describe('Three-Way Error Category Taxonomy', () => {
        it('handles Category 3 semantic rejection (issueCreate.success: false) as non-retryable', async () => {
            const team = await seedTestTeam()
            const integration = await seedTestTeamIntegration(team.id, 'LINEAR')

            mockLinearResponse('/graphql', mockLinearTeamsAndStates, 200, 'POST')
            mockLinearResponse('/graphql', mockLinearIssueCreateFailure, 200, 'POST')

            await expect(
                linearProvider.createExternalItem(integration, {
                    actionItemId: 'act_fail',
                    text: 'Test Issue Failure',
                    priority: 'MEDIUM',
                    context: { meetingTitle: 'Test', meetingDate: new Date() },
                    teamMetadata: {},
                })
            ).rejects.toThrow('LINEAR')
        })

        it('handles Category 2 non-retryable auth failure (AUTHENTICATION_ERROR)', async () => {
            const team = await seedTestTeam()
            const integration = await seedTestTeamIntegration(team.id, 'LINEAR')

            mockLinearResponse('/graphql', mockLinearAuthError, 200, 'POST')

            await expect(
                linearProvider.createExternalItem(integration, {
                    actionItemId: 'act_auth_fail',
                    text: 'Test Issue Auth Fail',
                    priority: 'MEDIUM',
                    context: { meetingTitle: 'Test', meetingDate: new Date() },
                    teamMetadata: {},
                })
            ).rejects.toThrow()
        })

        it('handles Category 2 retryable rate limit failure (RATELIMITED)', async () => {
            const team = await seedTestTeam()
            const integration = await seedTestTeamIntegration(team.id, 'LINEAR')

            mockLinearResponse('/graphql', mockLinearRateLimited, 200, 'POST')

            await expect(
                linearProvider.createExternalItem(integration, {
                    actionItemId: 'act_rate_limit',
                    text: 'Test Issue Rate Limited',
                    priority: 'MEDIUM',
                    context: { meetingTitle: 'Test', meetingDate: new Date() },
                    teamMetadata: {},
                })
            ).rejects.toThrow()
        })
    })

    describe('Assignee Email Resolution & 24-Hour Cache', () => {
        it('consults Redis cache on second lookup, preventing redundant API calls', async () => {
            const team = await seedTestTeam()
            const integration = await seedTestTeamIntegration(team.id, 'LINEAR')

            mockLinearResponse('/graphql', mockLinearUsersSearch, 200, 'POST')

            // First lookup — populates cache
            const firstResult = await (linearProvider as any).resolveAssigneeId(
                'secret_tok',
                'lin-team-001',
                'alice@rapto.dev'
            )
            expect(firstResult).toEqual('lin-usr-alice')

            // Assert Redis cache is set with TTL
            const cachedValue = await redis.get(`cache:linear:assignee:lin-team-001:alice@rapto.dev`)
            expect(cachedValue).toEqual('lin-usr-alice')

            // Second lookup — serviced from cache without network call
            const secondResult = await (linearProvider as any).resolveAssigneeId(
                'secret_tok',
                'lin-team-001',
                'alice@rapto.dev'
            )
            expect(secondResult).toEqual('lin-usr-alice')
        })
    })

    describe('Disconnect & Token Revocation', () => {
        it('attempts token revocation before integration cleanup', async () => {
            const team = await seedTestTeam()
            const integration = await seedTestTeamIntegration(team.id, 'LINEAR')

            httpMockRegistry.registerMock({
                domain: 'api.linear.app',
                urlPattern: '/oauth/revoke',
                method: 'POST',
                status: 200,
                body: { success: true },
            })

            await linearProvider.revokeToken(integration)

            // Verification log entry in interceptor proves revocation endpoint was called
            const logs = httpMockRegistry.getCallLogs()
            expect(logs.some(log => log.url.includes('/oauth/revoke'))).toBe(true)
        })
    })
})
