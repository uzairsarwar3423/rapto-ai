import { getMeetingDetail } from '@/features/meetings/api/meetings.queries.server'
import { MeetingOverviewTab } from '@/features/meetings/components/MeetingDetail/MeetingOverviewTab'
import { notFound } from 'next/navigation'

export default async function MeetingOverviewPage({
  params,
}: {
  params: Promise<{ meetingId: string }>
}) {
  const { meetingId } = await params
  const meeting = await getMeetingDetail(meetingId)
  if (!meeting) notFound()

  return <MeetingOverviewTab meeting={meeting} />
}
