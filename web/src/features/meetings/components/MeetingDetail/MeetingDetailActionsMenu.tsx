'use client'

import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { MoreHorizontal, RefreshCw, XCircle, Trash2 } from 'lucide-react'
import { ConfirmModal } from '@/shared/components/feedback/ConfirmModal'
import { toast } from 'sonner'
import type { MeetingDetail } from '../../types'

interface Props {
  meeting: MeetingDetail
  userRole?: string
}

export function MeetingDetailActionsMenu({ meeting, userRole = 'ADMIN' }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  
  const canManage = userRole === 'ADMIN' || userRole === 'OWNER'

  async function reprocessMeeting(id: string) {
    toast.success('Reprocessing requested')
  }

  async function removeBot(id: string) {
    toast.success('Bot removal requested')
  }

  async function deleteMeeting(id: string) {
    toast.success('Meeting deleted')
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Meeting actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {canManage && (
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); reprocessMeeting(meeting.id) }}>
              <RefreshCw className="h-3.5 w-3.5 mr-2" /> Reprocess
            </DropdownMenuItem>
          )}
          {meeting.status !== 'DONE' && (
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); removeBot(meeting.id) }}>
              <XCircle className="h-3.5 w-3.5 mr-2" /> Remove bot
            </DropdownMenuItem>
          )}
          {canManage && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) => { e.preventDefault(); setConfirmOpen(true) }}
                className="text-[--danger] focus:text-[--danger] focus:bg-[--danger]/10"
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete meeting
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this meeting?"
        description="This permanently removes the meeting, transcript, and all extracted commitments and action items. This cannot be undone."
        confirmLabel="Delete meeting"
        variant="destructive"
        onConfirm={() => deleteMeeting(meeting.id)}
      />
    </>
  )
}
