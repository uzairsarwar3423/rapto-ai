import { OAuthTokenResult } from '../integrations.types'

export interface CalendarProviderEvent {
    id: string
    status: 'confirmed' | 'cancelled'
    summary: string | null
    description: string | null
    location: string | null
    startTime: Date
    isAllDay: boolean
    meetingUrl: string | null
}

export interface CalendarSyncResult {
    events: CalendarProviderEvent[]
    nextSyncToken?: string
    fullResyncRequired: boolean
}

export interface CalendarProvider {
    getAuthorizationUrl(state: string, userId: string): string
    exchangeCodeForTokens(code: string): Promise<OAuthTokenResult>
    refreshAccessToken(refreshToken: string): Promise<OAuthTokenResult>
    listEvents(accessToken: string, params: { calendarId: string; syncToken?: string }): Promise<CalendarSyncResult>
    revokeToken(accessToken: string): Promise<void>
}
