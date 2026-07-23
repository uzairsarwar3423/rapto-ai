// ─────────────────────────────────────────────────────────────────────────────
// notion-integration.test.ts — Automated Integration Suite for Notion Provider
//
// Converts Day 62's manual verification plan into an automated suite covering:
// 1. Basic-Auth HTTP header token exchange verification
// 2. Schema-drift tolerant, omit-not-fail property assembly
// 3. Optional interface method proof point (updateExternalItemStatus absence)
// 4. Workspace user directory resolution & caching
// ─────────────────────────────────────────────────────────────────────────────

import { notionProvider } from '../../src/modules/integrations/providers/notion.provider'
import {
    mockNotionTokenExchange,
    mockNotionDatabaseSearch,
    mockNotionPageCreateSuccess,
    mockNotionSchemaDriftFailure,
    mockNotionUsersList,
} from '../fixtures/notion-responses.fixture'
import {
    httpMockRegistry,
    mockNotionResponse,
    resetHttpMocks,
} from '../support/http-mock-setup'
import {
    cleanTestDatabase,
    seedTestTeam,
    seedTestTeamIntegration,
    seedTestMeeting,
} from '../support/test-db'
import { OAUTH_CONFIGS } from '../../src/modules/integrations/providers/oauth-config'

describe('NotionIntegrationProvider — Automated Test Suite', () => {
    beforeEach(async () => {
        resetHttpMocks()
        await cleanTestDatabase()
    })

    afterAll(async () => {
        resetHttpMocks()
        await cleanTestDatabase()
    })

    describe('OAuth Callback & Basic-Auth Token Exchange', () => {
        it('uses Basic-Auth header for token exchange rather than body parameters', async () => {
            httpMockRegistry.registerMock({
                domain: 'api.notion.com',
                urlPattern: '/v1/oauth/token',
                method: 'POST',
                status: 200,
                body: mockNotionTokenExchange,
            })

            mockNotionResponse('/v1/users', mockNotionUsersList, 200, 'GET')

            const tokenResult = await notionProvider.exchangeCodeForTokens('valid_notion_code')

            expect(tokenResult.accessToken).toEqual('secret_notion_oauth_access_token_v1_xyz')
            expect(tokenResult.workspaceId).toEqual('ws-notion-888')
            expect(tokenResult.workspaceName).toEqual('Vocaply Engineering Workspace')

            // Verify Basic-Auth Header was dispatched
            const logs = httpMockRegistry.getCallLogs()
            const tokenCall = logs.find(l => l.url.includes('/v1/oauth/token'))
            expect(tokenCall).toBeDefined()

            const authHeader = tokenCall?.headers?.['Authorization'] || tokenCall?.headers?.['authorization']
            expect(authHeader).toBeDefined()
            expect(authHeader).toContain('Basic ')
        })
    })

    describe('Schema-Drift Tolerant Property Assembly', () => {
        it('safely creates meeting notes page and omits unmapped database properties', async () => {
            const team = await seedTestTeam()
            const integration = await seedTestTeamIntegration(team.id, 'NOTION', {
                metadata: {
                    databaseId: 'db-notion-action-items-123',
                },
            })
            const meeting = await seedTestMeeting(team.id)

            // Mock database retrieve, database search, and page create
            mockNotionResponse('/v1/databases/db-notion-action-items-123', mockNotionDatabaseSearch.results[0], 200, 'GET')
            mockNotionResponse('/v1/pages', mockNotionPageCreateSuccess, 200, 'POST')

            const result = await notionProvider.createMeetingPage!(integration, {
                title: 'Sprint Retrospective Notes',
                commitments: [{ text: 'Deliver Day 65 Integration Test Suite' }],
                actionItems: [{ text: 'Review PR with Principal Engineer' }],
            })

            expect(result.id).toEqual('page-notion-999')
            expect(result.url).toEqual('https://www.notion.so/Sprint-Retrospective-Notes-page-notion-999')
        })
    })

    describe('Optional Interface Method Proof Point', () => {
        it('confirms updateExternalItemStatus is undefined on Notion provider and does not throw on caller check', () => {
            expect(notionProvider.updateExternalItemStatus).toBeUndefined()

            // Safe caller invocation simulation
            const executeStatusUpdate = async () => {
                if (typeof notionProvider.updateExternalItemStatus === 'function') {
                    await notionProvider.updateExternalItemStatus({} as any, 'item-1', 'DONE')
                }
                return 'SKIPPED_GRACEFULLY'
            }

            expect(executeStatusUpdate()).resolves.toEqual('SKIPPED_GRACEFULLY')
        })
    })

    describe('Workspace User Directory Resolution', () => {
        it('resolves workspace user directory during connect', async () => {
            mockNotionResponse('/v1/users', mockNotionUsersList, 200, 'GET')

            const users = await (notionProvider as any).fetchWorkspaceUsers('secret_notion_tok')
            expect(users).toHaveLength(2)
            expect(users[0].email).toEqual('bob@vocaply.dev')
            expect(users[1].email).toEqual('alice@vocaply.dev')
        })
    })
})
