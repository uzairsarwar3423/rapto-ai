import { Queue } from 'bullmq';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const extractQueue = new Queue('extract', {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  }
});

async function run() {
  const meetingId = 'cmrbu3y60000lh2ufwo1j2s5c';
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }});
  
  if (!meeting) {
    console.log('Meeting not found');
    process.exit(1);
  }

  console.log(`Cleaning up existing data for meeting: ${meetingId}`);
  await prisma.actionItem.deleteMany({ where: { meetingId: meeting.id } });
  await prisma.commitment.deleteMany({ where: { meetingId: meeting.id } });
  await prisma.decision.deleteMany({ where: { meetingId: meeting.id } });
  await prisma.blocker.deleteMany({ where: { meetingId: meeting.id } });

  console.log(`Re-queuing extraction for meeting: ${meetingId}`);
  
  await extractQueue.add('extract-data', {
    meetingId: meeting.id,
    teamId: meeting.teamId,
    mongoTranscriptId: meeting.mongoTranscriptId
  });

  console.log('Successfully queued!');
  process.exit(0);
}

run().catch(console.error);
