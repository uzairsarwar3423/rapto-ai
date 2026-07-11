import axios, { AxiosInstance } from 'axios'
import { oauthProvidersConfig } from '../../../config/oauth-providers.config'
import { IntegrationError } from '../../../utils/errors'

export class GoogleSyncTokenExpiredError extends Error {
    constructor() {
        super('Google sync token expired or invalid')
        this.name = 'GoogleSyncTokenExpiredError'
    }
}

export interface GoogleTokenResponse {
    access_token: string
    refresh_token?: string
    expires_in: number
    scope: string
    token_type: string
}

export interface GoogleCalendarListEntry {
    id: string
    summary: string
    primary?: boolean
}

export interface GoogleCalendarEvent {
    id: string
    status: string
    htmlLink?: string
    created?: string
    updated?: string
    summary?: string
    description?: string
    location?: string
    start?: {
        dateTime?: string
        date?: string
        timeZone?: string
    }
    end?: {
        dateTime?: string
        date?: string
        timeZone?: string
    }
    conferenceData?: {
        entryPoints?: Array<{
            entryPointType: string
            uri: string
            label?: string
        }>
    }
}

export interface GoogleEventsResponse {
    nextPageToken?: string
    nextSyncToken?: string
    items: GoogleCalendarEvent[]
}

interface ListEventsParams {
    calendarId: string
    syncToken?: string
    timeMin?: string
    timeMax?: string
    singleEvents?: boolean
    orderBy?: string
    maxResults?: number
}

export class GoogleCalendarProvider {
    private readonly oauthClient: AxiosInstance
    private readonly apiClient: AxiosInstance
    private readonly config = oauthProvidersConfig.GOOGLE_CALENDAR

    constructor() {
        this.oauthClient = axios.create({
            timeout: 10000, // 10 seconds
        })

        this.apiClient = axios.create({
            baseURL: 'https://www.googleapis.com/calendar/v3',
            timeout: 10000, // 10 seconds
        })
        
        // Setup interceptor for retries on 429 and 5xx for API client
        this.apiClient.interceptors.response.use(
            (response) => response,
            async (error) => {
                const config = error.config
                if (!config) return Promise.reject(error)
                
                config.retryCount = config.retryCount || 0
                
                const status = error.response?.status
                const isRetryable = status === 429 || (status >= 500 && status < 600)
                
                if (isRetryable && config.retryCount < 3) {
                    config.retryCount += 1
                    
                    let delayMs = 1000 * Math.pow(2, config.retryCount - 1)
                    
                    if (status === 429 && error.response?.headers['retry-after']) {
                        const retryAfter = parseInt(error.response.headers['retry-after'], 10)
                        if (!isNaN(retryAfter)) {
                            delayMs = retryAfter * 1000
                        }
                    }
                    
                    await new Promise((resolve) => setTimeout(resolve, delayMs))
                    return this.apiClient(config)
                }
                
                return Promise.reject(error)
            }
        )
    }

    public getAuthorizationUrl(state: string): string {
        const url = new URL(this.config.authUrl)
        url.searchParams.append('client_id', this.config.clientId)
        url.searchParams.append('redirect_uri', this.config.redirectUri)
        url.searchParams.append('response_type', 'code')
        url.searchParams.append('scope', this.config.scopes.join(' '))
        url.searchParams.append('access_type', 'offline')
        url.searchParams.append('prompt', 'consent')
        url.searchParams.append('state', state)
        return url.toString()
    }

    public async exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
        try {
            const params = new URLSearchParams({
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                code,
                grant_type: 'authorization_code',
                redirect_uri: this.config.redirectUri,
            })

            const response = await this.oauthClient.post<GoogleTokenResponse>(
                this.config.tokenUrl,
                params.toString(),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                }
            )

            return response.data
        } catch (error: any) {
            this.handleOAuthError(error, 'AUTH_CODE_INVALID')
            throw new IntegrationError('GOOGLE_CALENDAR', 'Failed to exchange code')
        }
    }

    public async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }> {
        try {
            const params = new URLSearchParams({
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
            })

            const response = await this.oauthClient.post<GoogleTokenResponse>(
                this.config.tokenUrl,
                params.toString(),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                }
            )

            return {
                accessToken: response.data.access_token,
                expiresAt: new Date(Date.now() + response.data.expires_in * 1000)
            }
        } catch (error: any) {
            if (error.response?.status === 400 && error.response?.data?.error === 'invalid_grant') {
                throw new IntegrationError('GOOGLE_CALENDAR', 'GOOGLE_REFRESH_TOKEN_REVOKED')
            }
            this.handleOAuthError(error, 'TOKEN_REFRESH_FAILED')
            throw new IntegrationError('GOOGLE_CALENDAR', 'Failed to refresh token')
        }
    }

    public async revokeToken(token: string): Promise<void> {
        try {
            await this.oauthClient.post(
                this.config.revokeUrl,
                new URLSearchParams({ token }).toString(),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                }
            )
        } catch (error: any) {
            console.warn(`WARN: Failed to revoke Google token at endpoint: ${error.message}`)
        }
    }

    public async getUserCalendarList(accessToken: string): Promise<GoogleCalendarListEntry[]> {
        try {
            const response = await this.apiClient.get<{ items: GoogleCalendarListEntry[] }>(
                '/users/me/calendarList',
                {
                    headers: { Authorization: `Bearer ${accessToken}` }
                }
            )
            return response.data.items
        } catch (error: any) {
            this.handleApiError(error)
            throw new IntegrationError('GOOGLE_CALENDAR', 'Failed to fetch calendar list')
        }
    }

    public async listEvents(accessToken: string, params: ListEventsParams): Promise<GoogleEventsResponse> {
        try {
            // Validate mutual exclusivity
            if (params.syncToken && (params.timeMin || params.timeMax)) {
                throw new Error('Cannot provide timeMin/timeMax alongside syncToken')
            }

            const queryParams: Record<string, string | boolean | number> = {}
            if (params.syncToken) {
                queryParams.syncToken = params.syncToken
            } else {
                if (params.timeMin) queryParams.timeMin = params.timeMin
                if (params.timeMax) queryParams.timeMax = params.timeMax
                if (params.singleEvents !== undefined) queryParams.singleEvents = params.singleEvents
                if (params.orderBy) queryParams.orderBy = params.orderBy
            }
            if (params.maxResults) queryParams.maxResults = params.maxResults

            const response = await this.apiClient.get<GoogleEventsResponse>(
                `/calendars/${encodeURIComponent(params.calendarId)}/events`,
                {
                    params: queryParams,
                    headers: { Authorization: `Bearer ${accessToken}` }
                }
            )
            
            return response.data
        } catch (error: any) {
            if (error.response?.status === 410) {
                throw new GoogleSyncTokenExpiredError()
            }
            this.handleApiError(error)
            throw new IntegrationError('GOOGLE_CALENDAR', 'Failed to list events')
        }
    }

    private handleOAuthError(error: any, fallbackErrorCode: string) {
        if (error.response?.status === 400 && error.response?.data?.error === 'invalid_grant') {
            throw new IntegrationError('GOOGLE_CALENDAR', 'GOOGLE_AUTH_CODE_INVALID')
        }
        throw new IntegrationError('GOOGLE_CALENDAR', error.response?.data?.error || fallbackErrorCode)
    }

    private handleApiError(error: any) {
        const status = error.response?.status
        if (status === 401) {
            throw new IntegrationError('GOOGLE_CALENDAR', 'GOOGLE_TOKEN_INVALID')
        }
        if (status === 403) {
            throw new IntegrationError('GOOGLE_CALENDAR', 'GOOGLE_ACCESS_DENIED')
        }
        if (status === 429) {
            throw new IntegrationError('GOOGLE_CALENDAR', 'GOOGLE_RATE_LIMITED')
        }
        if (status >= 500) {
             throw new IntegrationError('GOOGLE_CALENDAR', 'GOOGLE_SERVICE_ERROR')
        }
    }
}

export const googleCalendarProvider = new GoogleCalendarProvider()
