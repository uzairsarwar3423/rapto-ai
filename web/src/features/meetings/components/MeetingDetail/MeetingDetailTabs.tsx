'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '', label: 'Overview' },
  { href: '/transcript', label: 'Transcript' },
  { href: '/action-items', label: 'Action items' },
  { href: '/commitments', label: 'Commitments' },
]

export function MeetingDetailTabs({ meetingId }: { meetingId: string }) {
  const pathname = usePathname()
  const base = `/meetings/${meetingId}`

  return (
    <nav className="flex gap-5 border-b border-border mt-3" aria-label="Meeting sections">
      {TABS.map((tab) => {
        const href = `${base}${tab.href}`
        const isActive = pathname === href
        return (
          <Link
            key={tab.href}
            href={href}
            className={cn(
              'relative h-9 text-sm text-muted-foreground transition-colors duration-120',
              'hover:text-foreground flex items-center',
              isActive && 'text-foreground font-medium'
            )}
          >
            {tab.label}
            {isActive && (
              <span className="absolute inset-x-0 -bottom-px h-[2px] bg-foreground rounded-full" />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
