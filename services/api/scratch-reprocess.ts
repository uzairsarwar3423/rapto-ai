import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env') });

import { prisma } from './src/db/client';
import { Queue } from 'bullmq';

async function run() {
  const meetingId = "cmrelgnpx0005h2vjlsio68my";
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }});
  
  if (!meeting) {
    console.error("Meeting not found");
    process.exit(1);
  }
  
  const q = new Queue('transcribe');
  await q.add('cleanup', {
    meetingId: meeting.id,
    teamId: meeting.teamId,
    mongoTranscriptId: meeting.mongoTranscriptId
  });
  
  console.log("Added to transcribe queue for reprocessing!");
  process.exit(0);
}

run();
