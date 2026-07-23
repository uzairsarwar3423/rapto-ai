// ─────────────────────────────────────────────────────────────────────────────
// jira-responses.fixture.ts — Production Fixtures for Jira Cloud REST API v3
//
// Models OAuth token exchange, issue creation, and HTTP 500 / 401 error shapes.
// ─────────────────────────────────────────────────────────────────────────────

export const mockJiraTokenExchange = {
    access_token: 'jira_access_token_v3_xyz123',
    refresh_token: 'jira_refresh_token_v3_abc987',
    expires_in: 3600,
    scope: 'read:jira-work write:jira-work offline_access',
    token_type: 'Bearer',
}

export const mockJiraAccessibleResources = [
    {
        id: 'cloud-site-id-12345',
        name: 'vocaply-jira-instance',
        url: 'https://vocaply.atlassian.net',
        scopes: ['read:jira-work', 'write:jira-work'],
        avatarUrl: 'https://site-admin.atlassian.net/avatars/240/site.png',
    },
]

export const mockJiraIssueCreateSuccess = {
    id: '10042',
    key: 'ENG-42',
    self: 'https://api.atlassian.com/ex/jira/cloud-site-id-12345/rest/api/3/issue/10042',
    keyUrl: 'https://vocaply.atlassian.net/browse/ENG-42',
}

export const mockJira500Error = {
    errorMessages: ['Internal server error encountered in Jira Cloud Service.'],
    errors: {},
}

export const mockJiraAuthError = {
    errorMessages: ['Unauthorized: Invalid OAuth 2.0 access token.'],
    errors: {},
}
