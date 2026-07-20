import "dotenv/config"
import { mongoService } from './src/services/mongo.service'
async function main() {
  const meeting = await require('./src/db/client').prisma.meeting.findUnique({ where: { id: 'cmrkrkczk0009h22i7040jkp8' } })
  if (!meeting?.mongoTranscriptId) return console.log("No mongo id")
  const transcript = await mongoService.findTranscript(meeting.mongoTranscriptId)
  console.log("Raw:", transcript?.raw_transcript?.length, "Normalized:", transcript?.normalized_transcript?.length)
}
main().catch(console.error).finally(() => process.exit(0))
