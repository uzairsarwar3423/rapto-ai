import { cn } from '@/lib/utils'
import type { MeetingDetail, MeetingStatus } from '../../types'
import { formatDistanceToNow } from 'date-fns'

const TIMELINE_STEPS: { status: MeetingStatus; label: string }[] = [
  { status: 'SCHEDULED',   label: 'Scheduled' },
  { status: 'BOT_JOINING', label: 'Bot joining' },
  { status: 'RECORDING',   label: 'Recording started' },
  { status: 'PROCESSING',  label: 'Processing transcript' },
  { status: 'DONE',        label: 'Completed' },
]

function getTimestampForStep(meeting: MeetingDetail, status: MeetingStatus): string | null {
  switch(status) {
    case 'SCHEDULED': return meeting.scheduledAt
    case 'BOT_JOINING': return meeting.botJoinedAt || null
    case 'RECORDING': return meeting.recordingStartedAt || meeting.startedAt || null
    case 'PROCESSING': return meeting.processingStartedAt || null
    case 'DONE': return meeting.completedAt || meeting.endedAt || null
    default: return null
  }
}

function RelativeTime({ date, className }: { date: string; className?: string }) {
  return (
    <div className={className}>
      {formatDistanceToNow(new Date(date), { addSuffix: true })}
    </div>
  )
}

export function MeetingTimeline({ meeting }: { meeting: MeetingDetail }) {
  const currentIndex = TIMELINE_STEPS.findIndex((s) => s.status === meeting.status)
  const isFailed = meeting.status === 'FAILED'

  return (
    <ol className="relative">
      {TIMELINE_STEPS.map((step, i) => {
        const timestamp = getTimestampForStep(meeting, step.status)
        const reached = timestamp ? true : (!isFailed && currentIndex !== -1 && i <= currentIndex)
        
        return (
          <li key={step.status} className="relative flex gap-3 pb-4 last:pb-0">
            {i < TIMELINE_STEPS.length - 1 && (
              <span className={cn(
                'absolute left-[3px] top-3 h-full w-px',
                reached ? 'bg-foreground/30' : 'bg-border'
              )} />
            )}
            <span className={cn(
              'relative z-10 mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
              reached ? 'bg-foreground' : 'bg-border'
            )} />
            <div className="flex-1">
              <div className={cn('text-xs', reached ? 'text-foreground' : 'text-muted-foreground')}>
                {step.label}
              </div>
              {timestamp && (
                <RelativeTime date={timestamp} className="text-2xs text-muted-foreground mt-0.5" />
              )}
            </div>
          </li>
        )
      })}
      {isFailed && (
        <li className="relative flex gap-3 text-[--danger]">
          <span className="relative z-10 mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[--danger]" />
          <div className="text-xs">Failed{meeting.processingError ? `: ${meeting.processingError}` : ''}</div>
        </li>
      )}
    </ol>
  )
}
