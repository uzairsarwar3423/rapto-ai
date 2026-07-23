// ─────────────────────────────────────────────────────────────────────────────
// outlook-calendar.test.ts — Automated Integration Suite for Outlook Calendar
//
// Converts Day 63's manual verification plan into an automated suite covering:
// 1. Windows timezone to IANA mapping & naive datetime UTC combination across offsets
//    (PDT, IST +05:30 fractional offset, DST boundary, all-day event)
// 2. Full delta link URL persistence (never truncated)
// 3. isCancelled: true handling routing to shared cancellation pipeline
// 4. Meeting URL extraction priority (onlineMeeting.joinUrl > regex fallback)
// 5. 410 SyncStateNotFound resync flag verification
// ─────────────────────────────────────────────────────────────────────────────

import { outlookCalendarProvider } from '../../src/modules/integrations/providers/outlook-calendar.provider'
import {
    mockOutlookPdtEvent,
    mockOutlookIstEvent,
    mockOutlookDstBoundaryEvent,
    mockOutlookAllDayEvent,
    mockOutlookDeltaResponse,
    mockOutlookSyncStateNotFound,
} from '../fixtures/outlook-events.fixture'
import {
    httpMockRegistry,
    mockOutlookGraphResponse,
    resetHttpMocks,
} from '../support/http-mock-setup'
import { fromZonedTime } from 'date-fns-tz'

describe('OutlookCalendarProvider — Automated Test Suite', () => {
    beforeEach(() => {
        resetHttpMocks()
    })

    afterAll(() => {
        resetHttpMocks()
    })

    describe('Windows Timezone to IANA Mapping & Naive Datetime UTC Combination', () => {
        it('correctly maps PDT, IST (+05:30), DST boundary, and all-day events to exact UTC dates', async () => {
            mockOutlookGraphResponse('/me/calendarView/delta', {
                value: [
                    mockOutlookPdtEvent,
                    mockOutlookIstEvent,
                    mockOutlookDstBoundaryEvent,
                    mockOutlookAllDayEvent,
                ],
            })

            const result = await outlookCalendarProvider.listEvents('mock_ms_token', { calendarId: 'primary' })

            expect(result.events).toHaveLength(4)

            // Event 1: PDT (Pacific Daylight Time -> America/Los_Angeles)
            // 2026-10-25T14:30:00 in America/Los_Angeles (UTC-7 during DST) -> 21:30:00 UTC
            const pdtEvt = result.events.find(e => e.id === 'ms-evt-pdt-001')
            expect(pdtEvt).toBeDefined()
            const expectedPdtUtc = fromZonedTime('2026-10-25T14:30:00.0000000', 'America/Los_Angeles')
            expect(pdtEvt!.startTime.toISOString()).toEqual(expectedPdtUtc.toISOString())
            expect(pdtEvt!.meetingUrl).toEqual('https://teams.microsoft.com/l/meetup-join/19%3ameeting_xyz123')

            // Event 2: IST (India Standard Time -> Asia/Kolkata +05:30)
            // 2026-10-26T09:00:00 in Asia/Kolkata -> 03:30:00 UTC
            const istEvt = result.events.find(e => e.id === 'ms-evt-ist-002')
            expect(istEvt).toBeDefined()
            const expectedIstUtc = fromZonedTime('2026-10-26T09:00:00.0000000', 'Asia/Kolkata')
            expect(istEvt!.startTime.toISOString()).toEqual(expectedIstUtc.toISOString())
            expect(istEvt!.meetingUrl).toEqual('https://zoom.us/j/9876543210')

            // Event 3: DST Boundary Event
            const dstEvt = result.events.find(e => e.id === 'ms-evt-dst-003')
            expect(dstEvt).toBeDefined()
            const expectedDstUtc = fromZonedTime('2026-11-01T01:30:00.0000000', 'America/New_York')
            expect(dstEvt!.startTime.toISOString()).toEqual(expectedDstUtc.toISOString())

            // Event 4: All-Day Event
            const allDayEvt = result.events.find(e => e.id === 'ms-evt-allday-004')
            expect(allDayEvt).toBeDefined()
            expect(allDayEvt!.isAllDay).toBe(true)
        })
    })

    describe('Delta Link Persistence & Truncation Defense', () => {
        it('persists full delta URL verbatim as nextSyncToken without truncation', async () => {
            mockOutlookGraphResponse('/me/calendarView/delta', mockOutlookDeltaResponse)

            const result = await outlookCalendarProvider.listEvents('mock_ms_token', { calendarId: 'primary' })

            expect(result.nextSyncToken).toEqual(
                'https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=xyz123_full_delta_token_untruncated'
            )
        })
    })

    describe('isCancelled Event Handling', () => {
        it('identifies cancelled events correctly for pipeline deletion processing', async () => {
            const cancelledFixture = {
                ...mockOutlookPdtEvent,
                id: 'ms-evt-cancelled-999',
                isCancelled: true,
            }

            mockOutlookGraphResponse('/me/calendarView/delta', { value: [cancelledFixture] })

            const result = await outlookCalendarProvider.listEvents('mock_ms_token', { calendarId: 'primary' })

            expect(result.events).toHaveLength(1)
            expect(result.events[0].isCancelled).toBe(true)
        })
    })

    describe('410 SyncStateNotFound Resync Trigger', () => {
        it('returns fullResyncRequired: true when Graph API returns 410 SyncStateNotFound', async () => {
            mockOutlookGraphResponse('/me/calendarView/delta', mockOutlookSyncStateNotFound, 410)

            const result = await outlookCalendarProvider.listEvents('mock_ms_token', {
                calendarId: 'primary',
                syncToken: 'stale_delta_link_xyz',
            })

            expect(result.fullResyncRequired).toBe(true)
            expect(result.events).toHaveLength(0)
        })
    })
})
