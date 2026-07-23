// ─────────────────────────────────────────────────────────────────────────────
// notion-responses.fixture.ts — Production Fixtures for Notion REST API v1
//
// Models full-shape responses for OAuth exchange, database search/schema,
// meeting page creation, user directory, and schema-drift error responses.
// ─────────────────────────────────────────────────────────────────────────────

export const mockNotionTokenExchange = {
    access_token: 'secret_notion_oauth_access_token_v1_xyz',
    token_type: 'bearer',
    bot_id: 'bot-notion-001',
    workspace_id: 'ws-notion-888',
    workspace_name: 'Vocaply Engineering Workspace',
    workspace_icon: 'https://notion.so/images/page-cover/met_murasaki_shikibu.jpg',
    owner: {
        type: 'user',
        user: {
            object: 'user',
            id: 'notion-usr-admin',
            name: 'Workspace Admin',
            avatar_url: null,
            type: 'person',
            person: {
                email: 'admin@vocaply.dev',
            },
        },
    },
}

export const mockNotionDatabaseSearch = {
    object: 'list',
    results: [
        {
            object: 'database',
            id: 'db-notion-action-items-123',
            cover: null,
            icon: { type: 'emoji', emoji: '📌' },
            created_time: '2026-01-01T00:00:00.000Z',
            last_edited_time: '2026-07-23T09:00:00.000Z',
            title: [
                {
                    type: 'text',
                    text: { content: 'Action Items & Meeting Notes', link: null },
                    plain_text: 'Action Items & Meeting Notes',
                    href: null,
                },
            ],
            properties: {
                Title: { id: 'title', name: 'Title', type: 'title', title: {} },
                Assignee: { id: 'assignee', name: 'Assignee', type: 'people', people: {} },
                Status: { id: 'status', name: 'Status', type: 'status', status: {} },
                DueDate: { id: 'due_date', name: 'Due Date', type: 'date', date: {} },
            },
            url: 'https://www.notion.so/db-notion-action-items-123',
        },
    ],
    next_cursor: null,
    has_more: false,
}

export const mockNotionPageCreateSuccess = {
    object: 'page',
    id: 'page-notion-999',
    created_time: '2026-07-23T10:05:00.000Z',
    last_edited_time: '2026-07-23T10:05:00.000Z',
    created_by: { object: 'user', id: 'bot-notion-001' },
    last_edited_by: { object: 'user', id: 'bot-notion-001' },
    parent: { type: 'database_id', database_id: 'db-notion-action-items-123' },
    archived: false,
    in_trash: false,
    properties: {
        Title: {
            id: 'title',
            type: 'title',
            title: [{ type: 'text', text: { content: 'Sprint Retrospective Notes' } }],
        },
    },
    url: 'https://www.notion.so/Sprint-Retrospective-Notes-page-notion-999',
    public_url: null,
}

export const mockNotionSchemaDriftFailure = {
    object: 'error',
    status: 400,
    code: 'validation_error',
    message: 'body failed validation: body.properties.NonExistentField should be defined, instead was `undefined`.',
}

export const mockNotionUsersList = {
    object: 'list',
    results: [
        {
            object: 'user',
            id: 'notion-usr-bob',
            name: 'Bob Jones',
            avatar_url: 'https://notion.so/avatars/bob.png',
            type: 'person',
            person: { email: 'bob@vocaply.dev' },
        },
        {
            object: 'user',
            id: 'notion-usr-alice',
            name: 'Alice Smith',
            avatar_url: 'https://notion.so/avatars/alice.png',
            type: 'person',
            person: { email: 'alice@vocaply.dev' },
        },
    ],
    next_cursor: null,
    has_more: false,
}
