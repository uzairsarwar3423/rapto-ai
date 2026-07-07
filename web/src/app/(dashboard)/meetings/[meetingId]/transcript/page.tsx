import { notFound } from "next/navigation"
import { getMeetingDetail, getMeetingTranscript } from "@/features/meetings/api/meetings.queries.server"
import { TranscriptViewer } from "@/features/meetings/components/TranscriptViewer/TranscriptViewer"

interface TranscriptPageProps {
  params: Promise<{ meetingId: string }>
}

export default async function TranscriptPage({ params }: TranscriptPageProps) {
  const { meetingId } = await params

  // 1. Fetch meeting detail server-side
  const meeting = await getMeetingDetail(meetingId)
  if (!meeting) {
    notFound()
  }

  // 2. Fetch transcript only if the meeting has successfully finished transcription
  const transcriptReadyStates = [
    "DONE", 
    "RESOLVED", 
    "RESOLUTION_FAILED", 
    "EXTRACTION_FAILED", 
    "EXTRACTED", 
    "EXTRACTED_PARTIAL",
    "TRANSCRIPT_CLEANED",
    "TRANSCRIPT_CLEANUP_FAILED",
    "TRANSCRIPT_CLEANUP_DEGRADED",
    "TRANSCRIBED"
  ]
  
  let transcript = null
  if (transcriptReadyStates.includes(meeting.status) && meeting.mongoTranscriptId) {
    transcript = await getMeetingTranscript(meetingId)
  }

  return (
    <TranscriptViewer
      transcript={transcript}
      meetingStatus={meeting.status}
    />
  )
}
