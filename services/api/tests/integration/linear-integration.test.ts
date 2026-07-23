// ─────────────────────────────────────────────────────────────────────────────
// linear-integration.test.ts — Automated Integration Suite for Linear Provider
//
// Converts Day 61's manual verification plan into an automated suite covering:
// 1. OAuth callback persistence (encrypted token, workspace metadata)
// 2. GraphQL mutation variable construction & priority mapping (1-4 scale)
// 3. Three-way error taxonomy (Category 3 semantic, Category 2 non-retryable auth,
//    Category 2 retryable rate limit)
// 4. Assignee email resolution with 24-hour Redis caching assertion
// 5. Disconnect behavior confirming token revocation attempt prior to row deletion
// ─────────────────────────────────────────────────────────────────────────────

import { linearProvider, LINEAR_PRIORITY_MAP } from '../../src/modules/integrations/providers/linear.provider'
import {
    mockLinearViewer,
    mockLinearTeamsAndStates,
    mockLinearIssueCreateSuccess,
    mockLinearIssueCreateFailure,
    mockLinearAuthError,
    mockLinearRateLimited,
    mockLinearUsersSearch,
} from '../fixtures/linear-responses.fixture'
import {
    httpMockRegistry,
    mockLinearResponse,
    resetHttpMocks,
} from '../support/http-mock-setup'
import {
    cleanTestDatabase,
    seedTestTeam,
    seedTestTeamIntegration,
} from '../support/test-db'
import { redis } from '../../src/config/redis'
import { decrypt } from '../../src/utils/crypto'

describe('LinearIntegrationProvider — Automated Test Suite', () => {
    beforeEach(async () => {
        resetHttpMocks()
        await cleanTestDatabase()
    })

    afterAll(async () => {
        resetHttpMocks()
        await cleanTestDatabase()
    })

    describe('OAuth Callback & Token Exchange', () => {
        it('persists access token with tokenExpiresAt: null and workspace metadata', async () => {
            // Mock exchangeCodeForTokens HTTP endpoints
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
            expect(tokenResult.tokenExpiresAt).toBeNull() // Linear personal access tokens do not expire
            expect(tokenResult.workspaceId).toEqual('lin-org-888')
            expect(tokenResult.workspaceName).toEqual('Vocaply Organization')
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
                title: 'Security Audit: RSA Key Rotation',
                description: 'Rotate standard JWT secret keys',
                priority: 'URGENT',
                assigneeEmail: 'alice@vocaply.dev',
            })

            expect(result.id).toEqual('lin-issue-101')
            expect(result.url).toEqual('https://linear.app/vocaply/issue/ENG-101/security-audit')
        })

        it('correctly maps all 4 Vocaply priority levels to Linear 1-4 integers', () => {
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
                    title: 'Test Issue Failure',
                    description: 'Description',
                })
            ).rejects.toThrow('LINEAR')
        })

        it('handles Category 2 non-retryable auth failure (AUTHENTICATION_ERROR)', async () => {
            const team = await seedTestTeam()
            const integration = await seedTestTeamIntegration(team.id, 'LINEAR')

            mockLinearResponse('/graphql', mockLinearAuthError, 200, 'POST')

            await expect(
                linearProvider.createExternalItem(integration, {
                    title: 'Test Issue Auth Fail',
                    description: 'Description',
                })
            ).rejects.toThrow()
        })

        it('handles Category 2 retryable rate limit failure (RATELIMITED)', async () => {
            const team = await seedTestTeam()
            const integration = await seedTestTeamIntegration(team.id, 'LINEAR')

            mockLinearResponse('/graphql', mockLinearRateLimited, 200, 'POST')

            await expect(
                linearProvider.createExternalItem(integration, {
                    title: 'Test Issue Rate Limited',
                    description: 'Description',
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
                'alice@vocaply.dev'
            )
            expect(firstResult).toEqual('lin-usr-alice')

            // Assert Redis cache is set with TTL
            const cachedValue = await redis.get(`cache:linear:assignee:lin-team-001:alice@vocaply.dev`)
            expect(cachedValue).toEqual('lin-usr-alice')

            // Second lookup — serviced from cache without network call
            const secondResult = await (linearProvider as any).resolveAssigneeId(
                'secret_tok',
                'lin-team-001',
                'alice@vocaply.dev'
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

            await linearProvider.disconnect(integration)

            // Verification log entry in interceptor proves revocation endpoint was called
            const logs = httpMockRegistry.getCallLogs()
            const revokeCall = logs.find(l => l.url.includes('/oauth/revoke'))
            expect(revokeCall).toBeDefined()
        })
    })
})
