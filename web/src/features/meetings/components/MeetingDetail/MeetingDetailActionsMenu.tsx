'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { MoreHorizontal, RefreshCw, XCircle, Trash2, Loader2 } from 'lucide-react'
import { ConfirmModal } from '@/shared/components/feedback/ConfirmModal'
import { toast } from 'sonner'
import { reprocessMeetingClient, removeBotClient, deleteMeetingClient } from '../../api/meetings.queries'
import { queryKeys } from '@/shared/lib/cache/query-keys'
import type { MeetingDetail } from '../../types'

interface Props {
  meeting: MeetingDetail
  userRole?: string
}

export function MeetingDetailActionsMenu({ meeting, userRole = 'ADMIN' }: Props) {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isReprocessing, setIsReprocessing] = useState(false)
  const [isRemovingBot, setIsRemovingBot] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  
  const canManage = userRole === 'ADMIN' || userRole === 'OWNER'

  async function handleReprocess(id: string) {
    if (isReprocessing) return
    setIsReprocessing(true)
    try {
      await reprocessMeetingClient(id)
      toast.success('Meeting reprocessing initiated. Re-extracting commitments and action items...')
      queryClient.invalidateQueries({ queryKey: queryKeys.meetings.all() })
      queryClient.invalidateQueries({ queryKey: queryKeys.meetings.detail(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.meetings.transcript(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.commitments.byMeeting(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.actionItems.byMeeting(id) })
      router.refresh()
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to reprocess meeting'
      toast.error(msg)
    } finally {
      setIsReprocessing(false)
    }
  }

  async function handleRemoveBot(id: string) {
    if (isRemovingBot) return
    setIsRemovingBot(true)
    try {
      await removeBotClient(id)
      toast.success('Bot removed. Meeting cancelled.')
      queryClient.invalidateQueries({ queryKey: queryKeys.meetings.all() })
      queryClient.invalidateQueries({ queryKey: queryKeys.meetings.detail(id) })
      router.refresh()
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to remove bot'
      toast.error(msg)
    } finally {
      setIsRemovingBot(false)
    }
  }

  async function handleDeleteMeeting(id: string) {
    if (isDeleting) return
    setIsDeleting(true)
    try {
      await deleteMeetingClient(id, true)
      toast.success('Meeting deleted successfully')
      queryClient.invalidateQueries({ queryKey: queryKeys.meetings.all() })
      router.push('/meetings')
      router.refresh()
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to delete meeting'
      toast.error(msg)
    } finally {
      setIsDeleting(false)
      setConfirmOpen(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Meeting actions" disabled={isReprocessing || isRemovingBot || isDeleting}>
            {isReprocessing || isRemovingBot || isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <MoreHorizontal className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 font-sans">
          {canManage && (
            <DropdownMenuItem
              disabled={isReprocessing || meeting.status === 'RECORDING' || meeting.status === 'BOT_JOINING'}
              onSelect={(e) => { e.preventDefault(); handleReprocess(meeting.id) }}
            >
              {isReprocessing ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-2" />}
              {isReprocessing ? 'Reprocessing...' : 'Reprocess'}
            </DropdownMenuItem>
          )}
          {meeting.status !== 'DONE' && meeting.status !== 'CANCELLED' && meeting.status !== 'FAILED' && (
            <DropdownMenuItem
              disabled={isRemovingBot}
              onSelect={(e) => { e.preventDefault(); handleRemoveBot(meeting.id) }}
            >
              {isRemovingBot ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <XCircle className="h-3.5 w-3.5 mr-2" />}
              {isRemovingBot ? 'Removing...' : 'Remove bot'}
            </DropdownMenuItem>
          )}
          {canManage && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={isDeleting}
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
        onConfirm={() => handleDeleteMeeting(meeting.id)}
      />
    </>
  )
}

