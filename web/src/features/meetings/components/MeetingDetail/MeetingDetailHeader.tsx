"use client";

import { MeetingPlatformIcon } from '../MeetingPlatformIcon'
import { MeetingStatusBadge } from '../MeetingStatusBadge'
import { MeetingDetailActionsMenu } from './MeetingDetailActionsMenu'
import type { MeetingDetail } from '../../types'
import { format } from 'date-fns'

export function MeetingDetailHeader({ meeting }: { meeting: MeetingDetail }) {
  const scheduledTime = meeting.scheduledAt ? format(new Date(meeting.scheduledAt), 'MMM d, yyyy • h:mm a') : ''
  const duration = meeting.durationMinutes ? `${meeting.durationMinutes} min` : ''
  const metaText = [scheduledTime, duration].filter(Boolean).join(' • ')

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between items-start gap-3 py-1 font-sans">
      <div className="flex flex-col gap-1.5 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <MeetingPlatformIcon platform={meeting.platform} className="h-4 w-4 shrink-0" />
          <h1 className="font-heading text-lg sm:text-xl font-bold tracking-tight text-foreground break-words">
            {meeting.title}
          </h1>
          <MeetingStatusBadge status={meeting.status} size="sm" />
        </div>
        {metaText && (
          <div className="text-xs text-muted-foreground tabular-nums font-mono">
            {metaText}
          </div>
        )}
      </div>
      <div className="self-end sm:self-auto shrink-0">
        <MeetingDetailActionsMenu meeting={meeting} />
      </div>
    </div>
  )
}
