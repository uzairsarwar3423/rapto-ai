import "dotenv/config"
import { prisma } from "../db/client"
import { aipipelineClient } from "../../services/ai-pipeline/ai-pipeline.client"

async function main() {
  const meetingId = "cmrkppeo7000bh26tjdoy70sq"
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { participants: true, actionItems: true, commitments: true }
  })
  if (!meeting) return console.log("Meeting not found")

  const teamUsers = await prisma.user.findMany({
    where: { teamId: meeting.teamId },
    select: { id: true, name: true, email: true }
  })

  console.log("=== Team Users ===")
  console.log(teamUsers)

  console.log("\n=== Meeting Participants ===")
  console.log(meeting.participants.map(p => ({ name: p.name, speakerTag: p.speakerTag, userId: p.userId })))

  console.log("\n=== Action Items (from DB) ===")
  console.log(meeting.actionItems.map(a => ({ text: a.text, assigneeId: a.assigneeId, assigneeNameRaw: a.assigneeNameRaw })))

  console.log("\n=== Commitments (from DB) ===")
  console.log(meeting.commitments.map(c => ({ text: c.text, ownerId: c.ownerId })))
  
  process.exit(0)
}

main()
