import { logger } from '../config/logger'
import { prisma } from '../db/client'
import { redis } from '../config/redis'
import { googleCalendarProvider, GoogleSyncTokenExpiredError, GoogleCalendarEvent } from '../modules/integrations/providers/google-calendar.provider'
import { getValidAccessToken } from './token-refresh.service'
import { detectPlatform, extractMeetingUrl } from '../utils/platform-detect'
import { dedupService } from './dedup.service'
import * as recallService from './recall.service'
import { createMeetingFromCalendar } from '../modules/meetings/meetings.service'
import type { CalendarSyncResult } from '../modules/integrations/integrations.types'
import { PlatformType } from '@prisma/client'

// ─────────────────────────────────────────────────────────────────────────────
// Calendar Sync Service
// ─────────────────────────────────────────────────────────────────────────────

export async function syncUserCalendar(userId: string): Promise<CalendarSyncResult> {
    logger.debug({ userId }, 'syncUserCalendar: started')

    // STEP 1 — Load Integration
    const integration = await prisma.userIntegration.findUnique({
        where: { userId_provider: { userId, provider: 'GOOGLE_CALENDAR' } },
        include: { user: true },
    })

    if (!integration || !integration.syncEnabled) {
        return {
            synced: 0, skipped: 0, duplicates: 0, errors: 0,
            message: 'NOT_CONNECTED_OR_DISABLED',
        }
    }

    if (!integration.user.teamId) {
        return {
            synced: 0, skipped: 0, duplicates: 0, errors: 1,
            message: 'User does not belong to a team',
        }
    }
    const teamId = integration.user.teamId

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

        // STEP 4 — Fetch Events From Google
        const calendarId = integration.calendarId || 'primary'
        const now = new Date()
        let eventsResult
        let isFallbackScan = false

        try {
            eventsResult = await googleCalendarProvider.listEvents(accessToken, {
                calendarId,
                ...(integration.nextSyncToken
                    ? { syncToken: integration.nextSyncToken }
                    : {
                        timeMin: now.toISOString(),
                        timeMax: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                        singleEvents: true,
                        orderBy: 'startTime'
                    }),
            })
        } catch (err: any) {
            if (err instanceof GoogleSyncTokenExpiredError) {
                logger.warn({ userId }, 'calendar-sync.sync_token_expired')
                isFallbackScan = true
                
                // Clear token and retry immediately
                await prisma.userIntegration.update({
                    where: { id: integration.id },
                    data: { nextSyncToken: null }
                })
                
                eventsResult = await googleCalendarProvider.listEvents(accessToken, {
                    calendarId,
                    timeMin: now.toISOString(),
                    timeMax: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    singleEvents: true,
                    orderBy: 'startTime'
                })
            } else {
                throw err // Caught by outer try/catch
            }
        }

        const events = eventsResult.items
        nextSyncToken = eventsResult.nextSyncToken

        // STEP 5 — Process Each Returned Event
        for (const event of events) {
            try {
                // a. Cancelled event
                if (event.status === 'cancelled') {
                    await handleCancelledCalendarEvent(teamId, event)
                    continue
                }

                // Skip all-day events or declined events
                if (!event.start?.dateTime) {
                    skipped++
                    continue
                }

                // b. Extract meeting URL
                const meetingUrl = extractMeetingUrl(event)
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

                const scheduledAt = new Date(event.start.dateTime)
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

        // STEP 6 — Persist Sync State
        await prisma.userIntegration.update({
            where: { id: integration.id },
            data: {
                lastSyncedAt: new Date(),
                nextSyncToken: nextSyncToken ?? (isFallbackScan ? null : integration.nextSyncToken),
                consecutiveErrors: 0,
                lastError: null,
            },
        })

    } catch (err: any) {
        await handleSyncFailure(integration, err)
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

async function handleCancelledCalendarEvent(teamId: string, event: GoogleCalendarEvent) {
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

async function handleSyncFailure(integration: any, err: any) {
    const consecutiveErrors = integration.consecutiveErrors + 1
    const lastError = err.message || 'Unknown error'

    const data: any = { consecutiveErrors, lastError }

    if (consecutiveErrors >= 5) {
        data.syncEnabled = false
        logger.warn({ userId: integration.userId, consecutiveErrors }, 'calendar-sync.integration_disabled')
        try {
            const { notifyQueue } = await import('../queues/queue.client')
            await notifyQueue.add('calendar-sync-failed', {
                type: 'CALENDAR_SYNC_FAILED',
                ownerId: integration.userId,
                metadata: { provider: integration.provider }
            })
        } catch (queueErr: any) {
            logger.error({ err: queueErr }, 'calendar-sync.failed_to_queue_notify_job')
        }
    }

    await prisma.userIntegration.update({
        where: { id: integration.id },
        data
    })
}
