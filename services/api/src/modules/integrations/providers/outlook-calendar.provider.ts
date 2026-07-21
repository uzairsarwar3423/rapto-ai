import { ConfidentialClientApplication, AuthenticationResult } from '@azure/msal-node'
import { oauthProvidersConfig } from '../../../config/oauth-providers.config'
import { IntegrationError } from '../../../utils/errors'
import { CalendarProvider, CalendarProviderEvent, CalendarSyncResult } from './calendar-provider.interface'
import { OAuthTokenResult } from '../integrations.types'
import { detectPlatform } from '../../../utils/platform-detect'
import { logger } from '../../../config/logger'
import axios from 'axios'
import { fromZonedTime } from 'date-fns-tz'

const config = oauthProvidersConfig.OUTLOOK_CALENDAR
const msalConfig = {
    auth: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
    }
}

// Windows to IANA mapping table
const windowsToIana: Record<string, string> = {
    "Dateline Standard Time": "Etc/GMT+12",
    "UTC-11": "Etc/GMT+11",
    "Aleutian Standard Time": "America/Adak",
    "Hawaiian Standard Time": "Pacific/Honolulu",
    "Marquesas Standard Time": "Pacific/Marquesas",
    "Alaskan Standard Time": "America/Anchorage",
    "UTC-09": "Etc/GMT+9",
    "Pacific Standard Time (Mexico)": "America/Tijuana",
    "UTC-08": "Etc/GMT+8",
    "Pacific Standard Time": "America/Los_Angeles",
    "US Mountain Standard Time": "America/Phoenix",
    "Mountain Standard Time (Mexico)": "America/Chihuahua",
    "Mountain Standard Time": "America/Denver",
    "Central America Standard Time": "America/Guatemala",
    "Central Standard Time": "America/Chicago",
    "Easter Island Standard Time": "Pacific/Easter",
    "Central Standard Time (Mexico)": "America/Mexico_City",
    "Canada Central Standard Time": "America/Regina",
    "SA Pacific Standard Time": "America/Bogota",
    "Eastern Standard Time (Mexico)": "America/Cancun",
    "Eastern Standard Time": "America/New_York",
    "Haiti Standard Time": "America/Port-au-Prince",
    "Cuba Standard Time": "America/Havana",
    "US Eastern Standard Time": "America/Indianapolis",
    "Turks And Caicos Standard Time": "America/Grand_Turk",
    "Paraguay Standard Time": "America/Asuncion",
    "Atlantic Standard Time": "America/Halifax",
    "Venezuela Standard Time": "America/Caracas",
    "Central Brazilian Standard Time": "America/Cuiaba",
    "SA Western Standard Time": "America/La_Paz",
    "Pacific SA Standard Time": "America/Santiago",
    "Newfoundland Standard Time": "America/St_Johns",
    "Tocantins Standard Time": "America/Araguaina",
    "E. South America Standard Time": "America/Sao_Paulo",
    "SA Eastern Standard Time": "America/Cayenne",
    "Argentina Standard Time": "America/Buenos_Aires",
    "Greenland Standard Time": "America/Godthab",
    "Montevideo Standard Time": "America/Montevideo",
    "Magallanes Standard Time": "America/Punta_Arenas",
    "Saint Pierre Standard Time": "America/Miquelon",
    "Bahia Standard Time": "America/Bahia",
    "UTC-02": "Etc/GMT+2",
    "Mid-Atlantic Standard Time": "Etc/GMT+2",
    "Azores Standard Time": "Atlantic/Azores",
    "Cape Verde Standard Time": "Atlantic/Cape_Verde",
    "UTC": "Etc/UTC",
    "GMT Standard Time": "Europe/London",
    "Greenwich Standard Time": "Atlantic/Reykjavik",
    "Sao Tome Standard Time": "Africa/Sao_Tome",
    "Morocco Standard Time": "Africa/Casablanca",
    "W. Europe Standard Time": "Europe/Berlin",
    "Central Europe Standard Time": "Europe/Budapest",
    "Romance Standard Time": "Europe/Paris",
    "Central European Standard Time": "Europe/Warsaw",
    "W. Central Africa Standard Time": "Africa/Lagos",
    "Jordan Standard Time": "Asia/Amman",
    "GTB Standard Time": "Europe/Bucharest",
    "Middle East Standard Time": "Asia/Beirut",
    "Egypt Standard Time": "Africa/Cairo",
    "E. Europe Standard Time": "Europe/Chisinau",
    "Syria Standard Time": "Asia/Damascus",
    "West Bank Standard Time": "Asia/Hebron",
    "South Africa Standard Time": "Africa/Johannesburg",
    "FLE Standard Time": "Europe/Kiev",
    "Israel Standard Time": "Asia/Jerusalem",
    "Kaliningrad Standard Time": "Europe/Kaliningrad",
    "Sudan Standard Time": "Africa/Khartoum",
    "Libya Standard Time": "Africa/Tripoli",
    "Namibia Standard Time": "Africa/Windhoek",
    "Arabic Standard Time": "Asia/Baghdad",
    "Turkey Standard Time": "Europe/Istanbul",
    "Arab Standard Time": "Asia/Riyadh",
    "Belarus Standard Time": "Europe/Minsk",
    "Russian Standard Time": "Europe/Moscow",
    "E. Africa Standard Time": "Africa/Nairobi",
    "Iran Standard Time": "Asia/Tehran",
    "Arabian Standard Time": "Asia/Dubai",
    "Astrakhan Standard Time": "Europe/Astrakhan",
    "Azerbaijan Standard Time": "Asia/Baku",
    "Russia Time Zone 3": "Europe/Samara",
    "Mauritius Standard Time": "Indian/Mauritius",
    "Saratov Standard Time": "Europe/Saratov",
    "Georgian Standard Time": "Asia/Tbilisi",
    "Volgograd Standard Time": "Europe/Volgograd",
    "Caucasus Standard Time": "Asia/Yerevan",
    "Afghanistan Standard Time": "Asia/Kabul",
    "West Asia Standard Time": "Asia/Tashkent",
    "Ekaterinburg Standard Time": "Asia/Yekaterinburg",
    "Pakistan Standard Time": "Asia/Karachi",
    "Qyzylorda Standard Time": "Asia/Qyzylorda",
    "India Standard Time": "Asia/Kolkata",
    "Sri Lanka Standard Time": "Asia/Colombo",
    "Nepal Standard Time": "Asia/Kathmandu",
    "Central Asia Standard Time": "Asia/Almaty",
    "Bangladesh Standard Time": "Asia/Dhaka",
    "Omsk Standard Time": "Asia/Omsk",
    "Myanmar Standard Time": "Asia/Rangoon",
    "SE Asia Standard Time": "Asia/Bangkok",
    "Altai Standard Time": "Asia/Barnaul",
    "W. Mongolia Standard Time": "Asia/Hovd",
    "North Asia Standard Time": "Asia/Krasnoyarsk",
    "N. Central Asia Standard Time": "Asia/Novosibirsk",
    "Tomsk Standard Time": "Asia/Tomsk",
    "China Standard Time": "Asia/Shanghai",
    "North Asia East Standard Time": "Asia/Irkutsk",
    "Singapore Standard Time": "Asia/Singapore",
    "W. Australia Standard Time": "Australia/Perth",
    "Taipei Standard Time": "Asia/Taipei",
    "Ulaanbaatar Standard Time": "Asia/Ulaanbaatar",
    "Aus Central W. Standard Time": "Australia/Eucla",
    "Transbaikal Standard Time": "Asia/Chita",
    "Tokyo Standard Time": "Asia/Tokyo",
    "North Korea Standard Time": "Asia/Pyongyang",
    "Korea Standard Time": "Asia/Seoul",
    "Yakutsk Standard Time": "Asia/Yakutsk",
    "Cen. Australia Standard Time": "Australia/Adelaide",
    "AUS Central Standard Time": "Australia/Darwin",
    "E. Australia Standard Time": "Australia/Brisbane",
    "AUS Eastern Standard Time": "Australia/Sydney",
    "West Pacific Standard Time": "Pacific/Port_Moresby",
    "Tasmania Standard Time": "Australia/Hobart",
    "Vladivostok Standard Time": "Asia/Vladivostok",
    "Lord Howe Standard Time": "Australia/Lord_Howe",
    "Bougainville Standard Time": "Pacific/Bougainville",
    "Russia Time Zone 10": "Asia/Srednekolymsk",
    "Magadan Standard Time": "Asia/Magadan",
    "Norfolk Standard Time": "Pacific/Norfolk",
    "Sakhalin Standard Time": "Asia/Sakhalin",
    "Central Pacific Standard Time": "Pacific/Guadalcanal",
    "Russia Time Zone 11": "Asia/Kamchatka",
    "New Zealand Standard Time": "Pacific/Auckland",
    "UTC+12": "Etc/GMT-12",
    "Fiji Standard Time": "Pacific/Fiji",
    "Chatham Islands Standard Time": "Pacific/Chatham",
    "UTC+13": "Etc/GMT-13",
    "Tonga Standard Time": "Pacific/Tongatapu",
    "Samoa Standard Time": "Pacific/Apia",
    "Line Islands Standard Time": "Pacific/Kiritimati"
}

export class OutlookCalendarProvider implements CalendarProvider {
    private _msalClient?: ConfidentialClientApplication

    private get msalClient(): ConfidentialClientApplication {
        if (!this._msalClient) {
            this._msalClient = new ConfidentialClientApplication(msalConfig)
        }
        return this._msalClient
    }

    public getAuthorizationUrl(state: string, userId: string): string {
        const url = new URL(config.authUrl)
        url.searchParams.append('client_id', config.clientId)
        url.searchParams.append('redirect_uri', config.redirectUri)
        url.searchParams.append('response_type', 'code')
        url.searchParams.append('scope', config.scopes.join(' '))
        url.searchParams.append('prompt', 'select_account')
        url.searchParams.append('state', state)
        return url.toString()
    }

    private extractRefreshTokenFromCache(): string | undefined {
        const cache = this.msalClient.getTokenCache().serialize()
        if (cache) {
            const parsed = JSON.parse(cache)
            if (parsed.RefreshToken) {
                const tokens = Object.values(parsed.RefreshToken) as any[]
                if (tokens.length > 0) {
                    return tokens[0].secret
                }
            }
        }
        return undefined
    }

    public async exchangeCodeForTokens(code: string): Promise<OAuthTokenResult> {
        try {
            const response = await this.msalClient.acquireTokenByCode({
                code,
                redirectUri: config.redirectUri,
                scopes: config.scopes
            })
            if (!response) {
                throw new Error('No response from MSAL')
            }
            const refreshToken = this.extractRefreshTokenFromCache()
            return {
                accessToken: response.accessToken,
                refreshToken: refreshToken,
                expiresAt: response.expiresOn || undefined
            }
        } catch (error: any) {
            throw new IntegrationError('OUTLOOK_CALENDAR', 'Failed to exchange code: ' + error.message)
        }
    }

    public async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResult> {
        try {
            const response = await this.msalClient.acquireTokenByRefreshToken({
                refreshToken,
                scopes: config.scopes
            })
            if (!response) {
                throw new Error('No response from MSAL')
            }
            const newRefreshToken = this.extractRefreshTokenFromCache() || refreshToken
            return {
                accessToken: response.accessToken,
                refreshToken: newRefreshToken,
                expiresAt: response.expiresOn || undefined
            }
        } catch (error: any) {
            throw new IntegrationError('OUTLOOK_CALENDAR', 'Failed to refresh token: ' + error.message)
        }
    }

    public async revokeToken(accessToken: string): Promise<void> {
        // "revokeToken() for Outlook performs the operations that genuinely are within Vocaply's control...
        // and explicitly does not claim to have invalidated the token at Microsoft's end"
        // This is a deliberate no-op server-side since there is no equivalent single-token-revocation endpoint.
        logger.info('Outlook token local revocation complete (Microsoft remote revocation not supported)')
    }

    public async listEvents(accessToken: string, params: { calendarId: string; syncToken?: string }): Promise<CalendarSyncResult> {
        const urlRegex = /(https?:\/\/[^\s]+)/g
        try {
            let url = params.syncToken
            if (!url) {
                const now = new Date()
                const startDateTime = now.toISOString()
                const endDateTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
                url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${startDateTime}&endDateTime=${endDateTime}`
            }

            const events: CalendarProviderEvent[] = []
            let nextUrl: string | undefined = url
            let nextSyncToken: string | undefined = undefined

            while (nextUrl) {
                const response: any = await axios.get(nextUrl, {
                    headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'odata.maxpagesize=50' }
                })
                
                const data = response.data
                const rawEvents = data.value || []

                for (const raw of rawEvents) {
                    const isCancelled = raw.isCancelled
                    const isAllDay = raw.isAllDay
                    
                    let startTime = new Date(0)
                    if (isAllDay && raw.start?.dateTime) {
                        // Date only
                        startTime = new Date(raw.start.dateTime.split('T')[0])
                    } else if (raw.start?.dateTime && raw.start?.timeZone) {
                        const ianaTz = windowsToIana[raw.start.timeZone]
                        if (!ianaTz) {
                            logger.warn({ tz: raw.start.timeZone }, 'calendar.outlook.timezone_mapping_miss')
                            // Fallback
                            startTime = new Date(raw.start.dateTime + 'Z')
                        } else {
                            startTime = fromZonedTime(raw.start.dateTime, ianaTz)
                        }
                    }

                    // Priority 1: onlineMeeting.joinUrl
                    let meetingUrl = raw.onlineMeeting?.joinUrl || null
                    
                    // Priority 2: bodyPreview regex scan
                    if (!meetingUrl && raw.bodyPreview) {
                        const matches = raw.bodyPreview.match(urlRegex)
                        if (matches) {
                            for (const match of matches) {
                                const { platform } = detectPlatform(match)
                                if (platform) {
                                    meetingUrl = match
                                    break
                                }
                            }
                        }
                    }
                    
                    // Priority 3: location regex scan
                    if (!meetingUrl && raw.location?.displayName) {
                        const matches = raw.location.displayName.match(urlRegex)
                        if (matches) {
                            for (const match of matches) {
                                const { platform } = detectPlatform(match)
                                if (platform) {
                                    meetingUrl = match
                                    break
                                }
                            }
                        }
                        if (!meetingUrl) {
                            const { platform } = detectPlatform(raw.location.displayName)
                            if (platform) meetingUrl = raw.location.displayName
                        }
                    }

                    events.push({
                        id: raw.id,
                        status: isCancelled ? 'cancelled' : 'confirmed',
                        summary: raw.subject || null,
                        description: raw.bodyPreview || null,
                        location: raw.location?.displayName || null,
                        startTime,
                        isAllDay: !!isAllDay,
                        meetingUrl
                    })
                }

                nextUrl = data['@odata.nextLink']
                if (data['@odata.deltaLink']) {
                    nextSyncToken = data['@odata.deltaLink']
                }
            }

            return {
                events,
                nextSyncToken,
                fullResyncRequired: false
            }

        } catch (error: any) {
            // Check for Graph delta expiry error
            const isDeltaExpired = error.response?.status === 410 || 
                                   (error.response?.data?.error?.code === 'SyncStateNotFound') ||
                                   (error.response?.data?.error?.code === 'ResyncRequired')
            if (isDeltaExpired) {
                return {
                    events: [],
                    fullResyncRequired: true
                }
            }
            throw new IntegrationError('OUTLOOK_CALENDAR', 'Failed to list events: ' + (error.response?.data?.error?.message || error.message))
        }
    }
}

export const outlookCalendarProvider = new OutlookCalendarProvider()
