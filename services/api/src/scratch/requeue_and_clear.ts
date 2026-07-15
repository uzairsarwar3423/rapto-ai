import "dotenv/config"
import { prisma } from "../db/client"
import { transcribeQueue } from "../queues/queue.client"
import { mongoService } from "../services/mongo.service"

async function main() {
  const meetingId = "cmrkrkczk0009h22i7040jkp8"
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId }
  })

  if (!meeting) {
    console.log("Meeting not found")
    process.exit(1)
  }

  // 1. Delete all extracted objects from PostgreSQL
  console.log("Deleting existing commitments, action items, decisions, and blockers...")
  await prisma.$transaction([
    prisma.commitment.deleteMany({ where: { meetingId } }),
    prisma.actionItem.deleteMany({ where: { meetingId } }),
    prisma.decision.deleteMany({ where: { meetingId } }),
    prisma.blocker.deleteMany({ where: { meetingId } })
  ])

  // 2. Also clear meeting status
  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      status: 'PROCESSING',
      commitmentCount: 0,
      actionItemCount: 0,
      decisionCount: 0,
      blockerCount: 0
    }
  })

  // 3. Optional: Delete meeting participants so transcribe.worker can recreate them with the new logic
  await prisma.meetingParticipant.deleteMany({ where: { meetingId } })

  // 4. Reset MongoDB status so we can re-transcribe
  if (meeting.mongoTranscriptId) {
    await mongoService.updateTranscript(meeting.mongoTranscriptId, {
      processing_status: 'pending_cleanup',
      cleanup_successful: null
    })
  }

  // 5. Add to queue
  console.log("Requeuing meeting for transcription...")
  await transcribeQueue.add("requeue-meeting", {
    meetingId: meeting.id,
    teamId: meeting.teamId,
    mongoTranscriptId: meeting.mongoTranscriptId
  })

  console.log("Success! Worker will process it now.")
  process.exit(0)
}

main()
