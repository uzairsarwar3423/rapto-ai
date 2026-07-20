import "dotenv/config"
import { mongoService } from './src/services/mongo.service'
async function main() {
  const meeting = await require('./src/db/client').prisma.meeting.findUnique({ where: { id: 'cmrkrkczk0009h22i7040jkp8' } })
  const transcript = await mongoService.findTranscript(meeting.mongoTranscriptId)
  console.log(Object.keys(transcript?.normalized_transcript?.[0] || {}))
  console.log(Object.keys(transcript?.raw_transcript?.[0] || {}))
}
main().catch(console.error).finally(() => process.exit(0))
