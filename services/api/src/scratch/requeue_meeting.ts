import "dotenv/config"
import { prisma } from "../db/client"
import { transcribeQueue } from "../queues/queue.client"

async function main() {
  const meetingId = "cmrkppeo7000bh26tjdoy70sq"
  
  console.log(`Requeuing meeting ${meetingId}...`)
  
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId }
  })
  
  if (!meeting) {
    console.error("Meeting not found")
    process.exit(1)
  }
  
  if (!meeting.mongoTranscriptId) {
    console.error("Meeting has no mongoTranscriptId")
    process.exit(1)
  }
  
  await transcribeQueue.add("requeue-meeting", {
    meetingId: meeting.id,
    teamId: meeting.teamId,
    mongoTranscriptId: meeting.mongoTranscriptId
  })
  
  console.log("Successfully added job to transcribe queue.")
  process.exit(0)
}

main()
