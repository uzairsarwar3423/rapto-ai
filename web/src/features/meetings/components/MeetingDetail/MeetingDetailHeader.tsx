"use client";

import { CalendarDays, Clock, Timer } from 'lucide-react'
import { MeetingPlatformIcon } from '../MeetingPlatformIcon'
import { MeetingStatusBadge } from '../MeetingStatusBadge'
import { MeetingDetailActionsMenu } from './MeetingDetailActionsMenu'
import type { MeetingDetail } from '../../types'
import { PLATFORM_LABEL, formatDuration } from '../../lib/meetingFormat'
import { format } from 'date-fns'

/**
 * Title-first header: a quiet platform + status line, the title as the single large element,
 * then date / time / duration as understated metadata. Actions stay a single ghost icon.
 */
export function MeetingDetailHeader({ meeting }: { meeting: MeetingDetail }) {
  const when = meeting.scheduledAt ? new Date(meeting.scheduledAt) : null
  const dateText = when ? format(when, 'EEE, MMM d, yyyy') : ''
  const timeText = when ? format(when, 'h:mm a') : ''
  const durationText = meeting.durationMinutes ? formatDuration(meeting.durationMinutes) : ''

  return (
    <header className="flex items-start justify-between gap-4 pt-1">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <MeetingPlatformIcon platform={meeting.platform} className="h-3.5 w-3.5 shrink-0" />
            <span>{PLATFORM_LABEL[meeting.platform] ?? 'Meeting'}</span>
          </span>
          <span aria-hidden="true" className="h-3 w-px bg-border" />
          <MeetingStatusBadge status={meeting.status} variant="quiet" />
        </div>

        <h1 className="text-balance break-words text-2xl font-semibold leading-[1.15] tracking-[-0.025em] text-foreground sm:text-[30px]">
          {meeting.title}
        </h1>

        {(dateText || durationText) && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] tabular-nums text-muted-foreground">
            {dateText && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                {dateText}
              </span>
            )}
            {timeText && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                {timeText}
              </span>
            )}
            {durationText && (
              <span className="inline-flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                {durationText}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 pt-0.5">
        <MeetingDetailActionsMenu meeting={meeting} />
      </div>
    </header>
  )
}
