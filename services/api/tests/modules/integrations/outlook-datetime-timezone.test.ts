import { outlookCalendarProvider } from '../../src/modules/integrations/providers/outlook-calendar.provider'
import axios from 'axios'
import { fromZonedTime } from 'date-fns-tz'

jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

describe('OutlookCalendarProvider - Timezone & Delta Link', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('correctly maps Windows timezones to IANA and combines with naive datetime', async () => {
        const mockEventsResponse = {
            data: {
                value: [
                    {
                        id: 'evt-1',
                        isCancelled: false,
                        isAllDay: false,
                        subject: 'Review Architecture',
                        start: {
                            dateTime: '2023-10-25T14:30:00.0000000',
                            timeZone: 'Pacific Standard Time'
                        },
                        end: {
                            dateTime: '2023-10-25T15:30:00.0000000',
                            timeZone: 'Pacific Standard Time'
                        },
                        onlineMeeting: {
                            joinUrl: 'https://teams.microsoft.com/l/meetup-join/123'
                        }
                    },
                    {
                        id: 'evt-2',
                        isCancelled: false,
                        isAllDay: false,
                        subject: 'Sync with India Team',
                        start: {
                            dateTime: '2023-10-26T09:00:00.0000000',
                            timeZone: 'India Standard Time'
                        },
                        onlineMeeting: {
                            joinUrl: 'https://zoom.us/j/123'
                        }
                    }
                ]
            }
        }
        
        mockedAxios.get.mockResolvedValueOnce(mockEventsResponse)

        const result = await outlookCalendarProvider.listEvents('fake-token', { calendarId: 'primary' })

        expect(result.events).toHaveLength(2)

        // Event 1: Pacific Standard Time -> America/Los_Angeles -> 14:30 PDT (October is DST) = 21:30 UTC
        const evt1 = result.events.find(e => e.id === 'evt-1')
        expect(evt1).toBeDefined()
        const expectedPdtToUtc = fromZonedTime('2023-10-25T14:30:00.0000000', 'America/Los_Angeles')
        expect(evt1!.startTime.toISOString()).toEqual(expectedPdtToUtc.toISOString())
        expect(evt1!.meetingUrl).toEqual('https://teams.microsoft.com/l/meetup-join/123')

        // Event 2: India Standard Time -> Asia/Kolkata -> 09:00 IST = 03:30 UTC
        const evt2 = result.events.find(e => e.id === 'evt-2')
        expect(evt2).toBeDefined()
        const expectedIstToUtc = fromZonedTime('2023-10-26T09:00:00.0000000', 'Asia/Kolkata')
        expect(evt2!.startTime.toISOString()).toEqual(expectedIstToUtc.toISOString())
    })

    it('returns fullResyncRequired when SyncStateNotFound error is thrown', async () => {
        mockedAxios.get.mockRejectedValueOnce({
            response: {
                status: 410,
                data: { error: { code: 'SyncStateNotFound', message: 'Sync state not found' } }
            }
        })

        const result = await outlookCalendarProvider.listEvents('fake-token', { calendarId: 'primary', syncToken: 'delta-123' })
        expect(result.fullResyncRequired).toBe(true)
        expect(result.events).toHaveLength(0)
    })

    it('persists delta link correctly', async () => {
        mockedAxios.get.mockResolvedValueOnce({
            data: {
                value: [],
                '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=xyz'
            }
        })

        const result = await outlookCalendarProvider.listEvents('fake-token', { calendarId: 'primary' })
        expect(result.nextSyncToken).toEqual('https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=xyz')
    })
})
