'use client'

import { useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { Participant } from '../../types'

const COLLAPSED_COUNT = 6

function getInitials(name: string) {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  )
}

/**
 * Compact roster: avatar, name, and the email as a quieter second line. Long meetings collapse
 * behind a single "Show N more" so the sidebar never grows into a wall of people.
 */
export function MeetingParticipantsList({ participants }: { participants: Participant[] }) {
  const [expanded, setExpanded] = useState(false)

  if (!participants.length) return null

  const hidden = Math.max(0, participants.length - COLLAPSED_COUNT)
  const visible = expanded ? participants : participants.slice(0, COLLAPSED_COUNT)

  return (
    <div>
      <ul className="space-y-0.5">
        {visible.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-lg py-1.5">
            <Avatar className="size-7 shrink-0">
              <AvatarImage src={p.avatarUrl} alt="" />
              <AvatarFallback className="bg-foreground/[0.06] text-[11px] font-medium text-foreground/60">
                {getInitials(p.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-medium leading-tight text-foreground">
                {p.name}
              </div>
              {p.email && (
                <div className="mt-0.5 truncate text-xs leading-tight text-muted-foreground">
                  {p.email}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-2 rounded-md py-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:text-foreground"
        >
          {expanded ? 'Show fewer' : `Show ${hidden} more`}
        </button>
      )}
    </div>
  )
}
