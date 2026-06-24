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
    <div className="flex items-center justify-between py-1">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <MeetingPlatformIcon platform={meeting.platform} className="h-4 w-4" />
          <h1 className="font-heading text-base-heading text-foreground">{meeting.title}</h1>
          <MeetingStatusBadge status={meeting.status} />
        </div>
        <div className="text-xs text-muted-foreground tabular-nums font-sans">
          {metaText}
        </div>
      </div>
      <MeetingDetailActionsMenu meeting={meeting} />
    </div>
  )
}
