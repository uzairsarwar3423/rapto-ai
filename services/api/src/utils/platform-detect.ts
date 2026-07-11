import crypto from 'crypto'
import { PlatformType } from '@prisma/client'
import { GoogleCalendarEvent } from '../modules/integrations/providers/google-calendar.provider'

export function detectPlatform(url: string): { platform: PlatformType | null; platformMeetingId: string | null } {
    if (!url) {
        return { platform: null, platformMeetingId: null }
    }

    try {
        const parsedUrl = new URL(url)
        const hostname = parsedUrl.hostname.toLowerCase()
        const pathname = parsedUrl.pathname

        // Zoom
        // Match: zoom.us/j/1234567890
        if (hostname.includes('zoom.us') || hostname.includes('zoom.gov')) {
            const match = pathname.match(/\/j\/(\d+)/)
            if (match && match[1]) {
                return { platform: PlatformType.ZOOM, platformMeetingId: match[1] }
            }
            // Personal vanity URL zoom.us/my/username
            const vanityMatch = pathname.match(/\/my\/([a-zA-Z0-9.-]+)/)
            if (vanityMatch && vanityMatch[1]) {
                return { platform: PlatformType.ZOOM, platformMeetingId: vanityMatch[1] }
            }
        }

        // Google Meet
        // Match: meet.google.com/abc-defg-hij
        if (hostname === 'meet.google.com') {
            const match = pathname.match(/\/([a-z0-9-]+)/i)
            if (match && match[1]) {
                // Meet codes are essentially case-insensitive in practice for dedup
                return { platform: PlatformType.GOOGLE_MEET, platformMeetingId: match[1].toLowerCase() }
            }
        }

        // Microsoft Teams
        // Match: teams.microsoft.com/l/meetup-join/...
        if (hostname.includes('teams.microsoft.com')) {
            // Teams URLs vary wildly and contain long tokens even for the same series.
            // Approach: Hash the entire URL up to the query string, or the full URL.
            // As documented in Day 56 Plan, this is a known limitation.
            const hash = crypto.createHash('sha256').update(url).digest('hex').substring(0, 16)
            return { platform: PlatformType.TEAMS, platformMeetingId: hash }
        }

        // Webex
        // Match: something.webex.com/meet/username or something.webex.com/m/12345
        if (hostname.includes('webex.com')) {
            const match = pathname.match(/\/(meet|m)\/([a-zA-Z0-9.-]+)/)
            if (match && match[2]) {
                return { platform: PlatformType.WEBEX, platformMeetingId: match[2] }
            }
        }
    } catch (e) {
        // Invalid URL
        return { platform: null, platformMeetingId: null }
    }

    return { platform: null, platformMeetingId: null }
}

export function extractMeetingUrl(event: GoogleCalendarEvent): string | null {
    // Priority 1: Google's structured conferenceData
    if (event.conferenceData?.entryPoints) {
        const videoEntry = event.conferenceData.entryPoints.find(ep => ep.entryPointType === 'video')
        if (videoEntry && videoEntry.uri) {
            return videoEntry.uri
        }
    }

    const urlRegex = /(https?:\/\/[^\s]+)/g

    // Priority 2: Description text regex scan
    if (event.description) {
        const matches = event.description.match(urlRegex)
        if (matches) {
            for (const match of matches) {
                const { platform } = detectPlatform(match)
                if (platform) {
                    return match
                }
            }
        }
    }

    // Priority 3: Location field
    if (event.location) {
        const matches = event.location.match(urlRegex)
        if (matches) {
            for (const match of matches) {
                const { platform } = detectPlatform(match)
                if (platform) {
                    return match
                }
            }
        }
        
        // Sometimes location is just the URL
        const { platform } = detectPlatform(event.location)
        if (platform) {
            return event.location
        }
    }

    return null
}
