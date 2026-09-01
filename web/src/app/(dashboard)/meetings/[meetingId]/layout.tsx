import { notFound } from 'next/navigation'
import { getMeetingDetail } from '@/features/meetings/api/meetings.queries.server'
import { MeetingDetailClientShell } from '@/features/meetings/components/MeetingDetail/MeetingDetailClientShell'

export default async function MeetingDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ meetingId: string }>
}) {
  const { meetingId } = await params
  const meeting = await getMeetingDetail(meetingId)
  if (!meeting) notFound()

  return (
    <MeetingDetailClientShell meetingId={meeting.id} initialMeeting={meeting}>
      {children}
    </MeetingDetailClientShell>
  )
}
