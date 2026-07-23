// ─────────────────────────────────────────────────────────────────────────────
// outlook-events.fixture.ts — Production Fixtures for Microsoft Graph Outlook
//
// Models Graph calendarView/delta responses spanning multiple Windows timezones
// (PDT, IST +05:30 fractional offset), DST boundary transitions, all-day events,
// delta link persistence, and 410 SyncStateNotFound responses.
// ─────────────────────────────────────────────────────────────────────────────

export const mockOutlookPdtEvent = {
    id: 'ms-evt-pdt-001',
    createdDateTime: '2026-10-20T12:00:00Z',
    lastModifiedDateTime: '2026-10-20T12:00:00Z',
    changeKey: 'ck-pdt-001',
    subject: 'Architecture & Scalability Review',
    isCancelled: false,
    isAllDay: false,
    start: {
        dateTime: '2026-10-25T14:30:00.0000000',
        timeZone: 'Pacific Standard Time',
    },
    end: {
        dateTime: '2026-10-25T15:30:00.0000000',
        timeZone: 'Pacific Standard Time',
    },
    onlineMeeting: {
        joinUrl: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_xyz123',
    },
    organizer: {
        emailAddress: {
            name: 'Principal Engineer',
            address: 'principal@company.com',
        },
    },
    attendees: [
        {
            type: 'required',
            status: { response: 'accepted', time: '2026-10-20T12:05:00Z' },
            emailAddress: { name: 'Alice Smith', address: 'alice@company.com' },
        },
    ],
}

export const mockOutlookIstEvent = {
    id: 'ms-evt-ist-002',
    createdDateTime: '2026-10-20T12:00:00Z',
    lastModifiedDateTime: '2026-10-20T12:00:00Z',
    changeKey: 'ck-ist-002',
    subject: 'Global Engineering Sync (India Team)',
    isCancelled: false,
    isAllDay: false,
    start: {
        dateTime: '2026-10-26T09:00:00.0000000',
        timeZone: 'India Standard Time',
    },
    end: {
        dateTime: '2026-10-26T10:00:00.0000000',
        timeZone: 'India Standard Time',
    },
    onlineMeeting: {
        joinUrl: 'https://zoom.us/j/9876543210',
    },
    organizer: {
        emailAddress: {
            name: 'Dev Lead',
            address: 'devlead@company.in',
        },
    },
}

export const mockOutlookDstBoundaryEvent = {
    id: 'ms-evt-dst-003',
    createdDateTime: '2026-11-01T00:00:00Z',
    lastModifiedDateTime: '2026-11-01T00:00:00Z',
    changeKey: 'ck-dst-003',
    subject: 'DST Transition Meeting (Fall Back)',
    isCancelled: false,
    isAllDay: false,
    start: {
        dateTime: '2026-11-01T01:30:00.0000000',
        timeZone: 'Eastern Standard Time',
    },
    end: {
        dateTime: '2026-11-01T02:30:00.0000000',
        timeZone: 'Eastern Standard Time',
    },
}

export const mockOutlookAllDayEvent = {
    id: 'ms-evt-allday-004',
    subject: 'Company Hackathon Day 1',
    isCancelled: false,
    isAllDay: true,
    start: {
        dateTime: '2026-12-01T00:00:00.0000000',
        timeZone: 'UTC',
    },
    end: {
        dateTime: '2026-12-02T00:00:00.0000000',
        timeZone: 'UTC',
    },
}

export const mockOutlookDeltaResponse = {
    '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#Collection(event)',
    '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=xyz123_full_delta_token_untruncated',
    value: [
        mockOutlookPdtEvent,
        mockOutlookIstEvent,
    ],
}

export const mockOutlookSyncStateNotFound = {
    error: {
        code: 'SyncStateNotFound',
        message: 'The provided sync state is stale or invalid. Perform a full resync.',
        innerError: {
            date: '2026-07-23T10:00:00',
            'request-id': 'req-ms-err-999',
        },
    },
}
