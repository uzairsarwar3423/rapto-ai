import { cn } from '@/lib/utils'
import type { MeetingStatus } from '../../types'

export function BotStatusBanner({ status }: { status: MeetingStatus }) {
  if (status !== 'BOT_JOINING' && status !== 'RECORDING') {
    return null
  }

  const copy = status === 'BOT_JOINING'
    ? { dot: 'bg-[--warning]', label: 'Bot is joining the meeting…' }
    : { dot: 'bg-[--danger]',  label: 'Recording live' }

  return (
    <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground">
      <span className={cn('h-1.5 w-1.5 rounded-full animate-pulse', copy.dot)} />
      {copy.label}
    </div>
  )
}
