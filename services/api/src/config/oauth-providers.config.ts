import { env } from './env'

export const oauthProvidersConfig = {
    GOOGLE_CALENDAR: {
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        revokeUrl: 'https://oauth2.googleapis.com/revoke',
        scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
        clientId: env.GOOGLE_CLIENT_ID || '',
        clientSecret: env.GOOGLE_CLIENT_SECRET || '',
        redirectUri: env.GOOGLE_CALENDAR_CALLBACK_URL || `${env.API_URL || env.APP_URL}/api/v1/integrations/google-calendar/callback`,
    },
    OUTLOOK_CALENDAR: {
        authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        revokeUrl: '',
        scopes: ['Calendars.Read', 'offline_access', 'openid', 'profile', 'email'],
        clientId: env.OUTLOOK_CLIENT_ID || '',
        clientSecret: env.OUTLOOK_CLIENT_SECRET || '',
        redirectUri: env.OUTLOOK_CALLBACK_URL || `${env.API_URL || env.APP_URL}/api/v1/integrations/outlook-calendar/callback`,
        tenantId: env.OUTLOOK_TENANT_ID || 'common',
    },
    // Placeholders for future integrations
    JIRA: {
        authUrl: 'https://auth.atlassian.com/authorize',
        tokenUrl: 'https://auth.atlassian.com/oauth/token',
        scopes: ['read:jira-work', 'write:jira-work', 'offline_access'],
        clientId: env.JIRA_CLIENT_ID || '',
        clientSecret: env.JIRA_CLIENT_SECRET || '',
        redirectUri: env.JIRA_CALLBACK_URL || '',
    },
    SLACK: {
        authUrl: 'https://slack.com/oauth/v2/authorize',
        tokenUrl: 'https://slack.com/api/oauth.v2.access',
        scopes: ['channels:read', 'chat:write'],
        clientId: env.SLACK_CLIENT_ID || '',
        clientSecret: env.SLACK_CLIENT_SECRET || '',
        redirectUri: env.SLACK_CALLBACK_URL || '',
    }
}

// Ensure critical credentials are set in production
if (env.NODE_ENV === 'production') {
    if (!oauthProvidersConfig.GOOGLE_CALENDAR.clientId || !oauthProvidersConfig.GOOGLE_CALENDAR.clientSecret) {
        console.warn('WARN: Missing Google OAuth credentials. Calendar integration will be disabled.')
    }
}
