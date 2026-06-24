import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Participant } from '../../types'

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

export function MeetingParticipantsList({ participants }: { participants: Participant[] }) {
  const visible = participants.slice(0, 5)
  const remaining = participants.slice(5)

  if (!participants.length) return null

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center">
        <div className="flex -space-x-1.5">
          {visible.map((p) => (
            <Tooltip key={p.id}>
              <TooltipTrigger asChild>
                <Avatar className="h-6 w-6 ring-2 ring-background">
                  <AvatarImage src={p.avatarUrl} />
                  <AvatarFallback className="text-2xs">{getInitials(p.name)}</AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent side="bottom">{p.name}</TooltipContent>
            </Tooltip>
          ))}
        </div>
        {remaining.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button className="ml-1.5 flex h-6 items-center rounded-full border border-border
                                  bg-surface px-2 text-2xs text-muted-foreground
                                  hover:bg-surface-hover transition-colors duration-120">
                +{remaining.length}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-1.5">
              <ul className="space-y-0.5">
                {remaining.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={p.avatarUrl} />
                      <AvatarFallback className="text-2xs">{getInitials(p.name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 truncate">
                      <div className="truncate text-xs text-foreground">{p.name}</div>
                      {p.email && <div className="truncate text-2xs text-muted-foreground">{p.email}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </TooltipProvider>
  )
}
