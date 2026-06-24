import { notFound } from 'next/navigation'
import { getMeetingDetail } from '@/features/meetings/api/meetings.queries.server'
import { MeetingDetailHeader } from '@/features/meetings/components/MeetingDetail/MeetingDetailHeader'
import { BotStatusBanner } from '@/features/meetings/components/MeetingDetail/BotStatusBanner'
import { MeetingDetailTabs } from '@/features/meetings/components/MeetingDetail/MeetingDetailTabs'
import { PageContainer } from '@/components/shared/layout/PageContainer'

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
    <PageContainer>
      <MeetingDetailHeader meeting={meeting} />
      <BotStatusBanner status={meeting.status} />
      <MeetingDetailTabs meetingId={meeting.id} />
      <div className="mt-4">{children}</div>
    </PageContainer>
  )
}
