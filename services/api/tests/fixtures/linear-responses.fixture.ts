// ─────────────────────────────────────────────────────────────────────────────
// linear-responses.fixture.ts — Production Fixtures for Linear GraphQL API
//
// Models full-shape responses for Linear viewer, issue creation, team schema,
// user search, and 3-category error responses (semantic, transport, retryable).
// ─────────────────────────────────────────────────────────────────────────────

export const mockLinearViewer = {
    data: {
        viewer: {
            id: 'lin-usr-001',
            name: 'Engineering Admin',
            email: 'admin@vocaply.dev',
            organization: {
                id: 'lin-org-888',
                name: 'Vocaply Organization',
            },
        },
    },
}

export const mockLinearTeamsAndStates = {
    data: {
        teams: {
            nodes: [
                {
                    id: 'lin-team-001',
                    name: 'Engineering',
                    key: 'ENG',
                    states: {
                        nodes: [
                            { id: 'state-backlog', name: 'Backlog', type: 'backlog' },
                            { id: 'state-todo', name: 'Todo', type: 'unstarted' },
                            { id: 'state-in-progress', name: 'In Progress', type: 'started' },
                            { id: 'state-done', name: 'Done', type: 'completed' },
                        ],
                    },
                },
            ],
        },
    },
}

export const mockLinearUsersSearch = {
    data: {
        users: {
            nodes: [
                {
                    id: 'lin-usr-alice',
                    name: 'Alice Smith',
                    email: 'alice@vocaply.dev',
                    active: true,
                },
                {
                    id: 'lin-usr-bob',
                    name: 'Bob Jones',
                    email: 'bob@vocaply.dev',
                    active: true,
                },
            ],
        },
    },
}

export const mockLinearIssueCreateSuccess = {
    data: {
        issueCreate: {
            success: true,
            issue: {
                id: 'lin-issue-101',
                identifier: 'ENG-101',
                title: 'Security Audit: Implement RSA Key Rotation',
                url: 'https://linear.app/vocaply/issue/ENG-101/security-audit',
                createdAt: '2026-07-23T10:00:00.000Z',
                updatedAt: '2026-07-23T10:00:00.000Z',
                priority: 3, // High
                state: {
                    id: 'state-todo',
                    name: 'Todo',
                },
                assignee: {
                    id: 'lin-usr-alice',
                    name: 'Alice Smith',
                    email: 'alice@vocaply.dev',
                },
            },
        },
    },
}

// Category 3 — Semantic rejection (e.g. invalid workflow state or team ID)
export const mockLinearIssueCreateFailure = {
    data: {
        issueCreate: {
            success: false,
            issue: null,
        },
    },
}

// Category 2 — Transport level non-retryable authentication error
export const mockLinearAuthError = {
    errors: [
        {
            message: 'Authentication token expired or revoked',
            locations: [{ line: 2, column: 3 }],
            path: ['issueCreate'],
            extensions: {
                code: 'AUTHENTICATION_ERROR',
                userPresentableMessage: 'Your access token is invalid',
            },
        },
    ],
}

// Category 2 — Transport level retryable rate limit error
export const mockLinearRateLimited = {
    errors: [
        {
            message: 'Rate limit exceeded for GraphQL mutation issueCreate',
            extensions: {
                code: 'RATELIMITED',
                retryAfter: 60,
            },
        },
    ],
}
