import { logger } from '../config/logger'
import { prisma } from '../db/client'
import { redis } from '../config/redis'
import { calendarProviderRegistry } from '../modules/integrations/providers/calendar-provider.registry'
import { CalendarProviderEvent } from '../modules/integrations/providers/calendar-provider.interface'
import { getValidAccessToken } from './token-refresh.service'
import { detectPlatform } from '../utils/platform-detect'
import { dedupService } from './dedup.service'
import * as recallService from './recall.service'
import { createMeetingFromCalendar } from '../modules/meetings/meetings.service'
import type { CalendarSyncResult } from '../modules/integrations/integrations.types'
import { PlatformType } from '@prisma/client'
import { integrationsRepository } from '../modules/integrations/integrations.repository'

// ─────────────────────────────────────────────────────────────────────────────
// Calendar Sync Service
// ─────────────────────────────────────────────────────────────────────────────

export async function syncUserCalendar(userId: string): Promise<CalendarSyncResult> {
    logger.debug({ userId }, 'syncUserCalendar: started')

    // STEP 1 — Load Integration
    const integration = await integrationsRepository.findActiveCalendarIntegration(userId)
    if (!integration) {
        return {
            synced: 0, skipped: 0, duplicates: 0, errors: 0,
            message: 'NOT_CONNECTED_OR_DISABLED',
        }
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user?.teamId) {
        return {
            synced: 0, skipped: 0, duplicates: 0, errors: 1,
            message: 'User does not belong to a team',
        }
    }
    const teamId = user.teamId

    // STEP 2 — Acquire Per-User Sync Lock
    const lockKey = `sync:calendar:lock:${userId}`
    const acquired = await redis.set(lockKey, '1', 'EX', 300, 'NX')
    if (!acquired) {
        logger.debug({ userId }, 'calendar-sync.lock_skip: SYNC_IN_PROGRESS')
        return {
            synced: 0, skipped: 0, duplicates: 0, errors: 0,
            message: 'SYNC_IN_PROGRESS',
        }
    }

    let synced = 0, skipped = 0, duplicates = 0, errorsCount = 0
    let nextSyncToken: string | undefined = undefined

    try {
        logger.info({ userId }, 'calendar-sync.lock_acquired')

        // STEP 3 — Obtain a Valid Access Token
        const accessToken = await getValidAccessToken(integration)

        // STEP 4 — Fetch Events From Provider
        const calendarId = integration.calendarId || 'primary'
        let eventsResult
        let isFallbackScan = false

        const provider = calendarProviderRegistry.getProvider(integration.provider)

        eventsResult = await provider.listEvents(accessToken, {
            calendarId,
            syncToken: integration.nextSyncToken || undefined
        })

        if (eventsResult.fullResyncRequired) {
            logger.warn({ userId }, 'calendar-sync.sync_token_expired_or_invalid')
            isFallbackScan = true
            
            // Clear token and retry immediately
            await prisma.userIntegration.update({
                where: { id: integration.id },
                data: { nextSyncToken: null }
            })
            
            eventsResult = await provider.listEvents(accessToken, {
                calendarId,
                syncToken: undefined
            })
        }

        const events = eventsResult.events
        nextSyncToken = eventsResult.nextSyncToken

        const now = new Date()

        // STEP 5 — Process Each Returned Event
        for (const event of events) {
            try {
                // a. Cancelled event
                if (event.status === 'cancelled') {
                    await handleCancelledCalendarEvent(teamId, event)
                    continue
                }

                // Skip all-day events or declined events
                if (event.isAllDay) {
                    skipped++
                    continue
                }

                // b. Extract meeting URL
                const meetingUrl = event.meetingUrl
                if (!meetingUrl) {
                    skipped++
                    continue
                }

                // c. Detect platform
                const { platform, platformMeetingId } = detectPlatform(meetingUrl)
                if (!platform || platform === PlatformType.MANUAL || !platformMeetingId) {
                    skipped++
                    continue
                }

                const scheduledAt = event.startTime
                // Filter out past events
                if (scheduledAt.getTime() < now.getTime()) {
                    skipped++
                    continue
                }

                // d. Call dedupService.checkAndClaim()
                const isDuplicate = await dedupService.checkAndClaim({
                    teamId,
                    platform,
                    platformMeetingId,
                    scheduledAt
                })

                if (isDuplicate) {
                    logger.debug({ userId, eventId: event.id, platformMeetingId }, 'calendar-sync.event_skipped: Duplicate')
                    duplicates++
                    continue
                }

                // e. Call meetingsService.createMeetingFromCalendar()
                let meetingId: string | null = null
                try {
                    const meeting = await createMeetingFromCalendar({
                        title: event.summary || 'Untitled Meeting',
                        platform,
                        meetingUrl,
                        platformMeetingId,
                        scheduledAt,
                        calendarEventId: event.id,
                        calendarSourceUserId: userId,
                        teamId
                    })
                    meetingId = meeting.id
                } catch (meetingErr: any) {
                    logger.error({ userId, eventId: event.id, err: meetingErr.message }, 'calendar-sync.event_failed')
                    await dedupService.releaseClaim(platform, platformMeetingId)
                    errorsCount++
                    continue
                }

                // f. On success
                if (meetingId) {
                    await dedupService.confirmClaim(platform, platformMeetingId, meetingId)
                    synced++
                    logger.info({ userId, teamId, meetingId, eventId: event.id }, 'calendar-sync.meeting_created')
                }

            } catch (eventErr: any) {
                logger.error({ userId, eventId: event.id, err: eventErr.message }, 'calendar-sync.event_failed')
                errorsCount++
            }
        }

        // STEP 6 — Persist Sync State & Record Health Success
        await prisma.userIntegration.update({
            where: { id: integration.id },
            data: {
                lastSyncedAt: new Date(),
                nextSyncToken: nextSyncToken ?? (isFallbackScan ? null : integration.nextSyncToken),
            },
        })
        const { integrationHealthService } = await import('./integration-health.service')
        await integrationHealthService.recordSuccess(integration)

    } catch (err: any) {
        const { integrationHealthService } = await import('./integration-health.service')
        await integrationHealthService.recordFailure(integration, err.message || 'Unknown calendar sync error')
        throw err // Re-throw for BullMQ retry
    } finally {
        // STEP 7 — Release Lock & Return
        await redis.del(lockKey)
    }

    logger.info({ userId, synced, skipped, errorsCount }, 'calendar-sync.completed')

    return {
        synced,
        skipped,
        duplicates,
        errors: errorsCount,
        message: 'Sync complete',
        nextSyncToken,
    }
}

async function handleCancelledCalendarEvent(teamId: string, event: CalendarProviderEvent) {
    if (!event.id) return

    const meeting = await prisma.meeting.findFirst({
        where: { teamId, calendarEventId: event.id }
    })

    if (!meeting) return // No-op: we never created it

    if (['SCHEDULED', 'BOT_JOINING'].includes(meeting.status)) {
        if (meeting.recallBotId) {
            try {
                await recallService.removeBot(meeting.recallBotId)
            } catch (err) {
                // Ignore 404s
            }
        }
        
        await prisma.meeting.update({
            where: { id: meeting.id },
            data: { status: 'CANCELLED' }
        })

        if (meeting.platform && meeting.platformMeetingId) {
            await dedupService.releaseClaim(meeting.platform, meeting.platformMeetingId)
        }

        try {
            const { getIO } = await import('../realtime/socket.server')
            const { SERVER_EVENTS } = await import('../realtime/socket.events')
            const { teamRoom } = await import('../realtime/rooms.manager')
            getIO().to(teamRoom(teamId)).emit(SERVER_EVENTS.MEETING_BOT_JOINING, {
                meetingId: meeting.id,
                cancelled: true,
            })
        } catch (e) {
            logger.error({ err: e }, 'Failed to emit socket event during calendar event cancellation')
        }
    }
    // Explicitly a no-op for RECORDING, PROCESSING, DONE, FAILED, CANCELLED
}

export const calendarSyncService = {
    syncUserCalendar,
}

