// ─────────────────────────────────────────────────────────────────────────────
// slack-responses.fixture.ts — Production Fixtures for Slack Web API
//
// Models OAuth token exchange, chat.postMessage, and error responses.
// ─────────────────────────────────────────────────────────────────────────────

export const mockSlackTokenExchange = {
    ok: true,
    access_token: 'xoxb-slack-bot-token-123456789-abcdef',
    token_type: 'bot',
    scope: 'chat:write,channels:read,users:read,users:read.email',
    bot_user_id: 'U001BOT',
    app_id: 'A001APP',
    team: {
        id: 'T001TEAM',
        name: 'Vocaply Slack Workspace',
    },
    authed_user: {
        id: 'U001USER',
        scope: 'identify',
        access_token: 'xoxp-user-token-xyz',
        token_type: 'user',
    },
}

export const mockSlackPostMessageSuccess = {
    ok: true,
    channel: 'C0123456789',
    ts: '1620000000.000100',
    message: {
        bot_id: 'B001BOT',
        type: 'message',
        text: 'Action Item Assigned: Implement RSA Key Rotation',
        user: 'U001BOT',
        ts: '1620000000.000100',
    },
}

export const mockSlackErrorResponse = {
    ok: false,
    error: 'channel_not_found',
    response_metadata: {
        scopes: ['chat:write'],
    },
}
