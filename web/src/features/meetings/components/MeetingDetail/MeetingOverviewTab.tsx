import { MeetingSummaryBlock } from './MeetingSummaryBlock'
import { MeetingParticipantsList } from './MeetingParticipantsList'
import { MeetingTimeline } from './MeetingTimeline'
import type { MeetingDetail } from '../../types'
import { Card } from '@/components/ui/card'

export function MeetingOverviewTab({ meeting }: { meeting: MeetingDetail }) {
  return (
    <div className="mt-4 grid grid-cols-12 gap-4">
      <div className="col-span-12 md:col-span-8 flex flex-col gap-4">
        <MeetingSummaryBlock summary={meeting.summary} />
      </div>
      <div className="col-span-12 md:col-span-4 flex flex-col gap-4">
        <Card className="p-4">
          <h3 className="mb-3 text-xs font-medium text-foreground">Participants</h3>
          <MeetingParticipantsList participants={meeting.participants || []} />
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 text-xs font-medium text-foreground">Timeline</h3>
          <MeetingTimeline meeting={meeting} />
        </Card>
      </div>
    </div>
  )
}
