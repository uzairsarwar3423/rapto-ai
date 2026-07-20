import "dotenv/config"
import { prisma } from './src/db/client'
import { mongoService } from './src/services/mongo.service'
import { resolveParticipantToUserId } from './src/utils/participant-matcher'

async function main() {
  const meetingId = 'cmrkrkczk0009h22i7040jkp8'
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } })
  if (!meeting?.mongoTranscriptId) return console.log("No mongo id")
  const transcript = await mongoService.findTranscript(meeting.mongoTranscriptId)
  
  const uniqueSpeakers = new Set<string>()
  const normalized = transcript?.normalized_transcript as any[]
  if (normalized && Array.isArray(normalized) && normalized.length > 0) {
    for (const turn of normalized) {
      const speaker = turn.speaker || turn.speaker_name || turn.speaker_tag || turn.participant?.name || 'Unknown'
      if (speaker !== 'Unknown') uniqueSpeakers.add(speaker)
    }
  } else if (transcript?.raw_transcript && Array.isArray(transcript.raw_transcript)) {
    for (const turn of transcript.raw_transcript as any[]) {
      const speaker = turn.speaker || turn.speaker_name || turn.speaker_tag || turn.participant?.name || 'Unknown'
      if (speaker !== 'Unknown') uniqueSpeakers.add(speaker)
    }
  }

  const existingParticipants = await prisma.meetingParticipant.findMany({
    where: { meetingId },
    select: { speakerTag: true },
  })
  
  const existingTags = new Set(existingParticipants.map(p => p.speakerTag))
  const newSpeakers = Array.from(uniqueSpeakers).filter(tag => tag && !existingTags.has(tag))
  
  if (newSpeakers.length > 0) {
    const teamUsers = await prisma.user.findMany({
      where: { teamId: meeting.teamId },
      select: { id: true, name: true, email: true }
    })

    await prisma.meetingParticipant.createMany({
      data: newSpeakers.map(tag => ({
        meetingId,
        name: tag,
        speakerTag: tag,
        userId: resolveParticipantToUserId(tag, teamUsers),
      }))
    })

    await prisma.meeting.update({
      where: { id: meetingId },
      data: { participantCount: existingParticipants.length + newSpeakers.length }
    })
    console.log(`Inserted ${newSpeakers.length} participants!`)
  } else {
    console.log("No new participants found.")
  }
}

main().catch(console.error).finally(() => process.exit(0))
