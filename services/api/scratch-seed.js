const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const u = await prisma.user.findFirst({ where: { email: 'uzairsarwar3423@gmail.com' } });
  if (!u || !u.teamId) {
    console.log("User or team not found");
    return;
  }

  // Create a meeting first
  const meeting = await prisma.meeting.create({
    data: {
      teamId: u.teamId,
      title: 'Weekly Engineering Sync',
      platform: 'GOOGLE_MEET',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      status: 'DONE',
      scheduledAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
      startedAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
      endedAt: new Date(Date.now() - 1000 * 60 * 60 * 23),
    }
  });

  console.log("Created meeting:", meeting.id);

  // Create some commitments
  await prisma.commitment.create({
    data: {
      teamId: u.teamId,
      ownerId: u.id,
      meetingId: meeting.id,
      text: 'Finalize the database schema for analytics',
      status: 'PENDING',
      confidenceScore: 0.95,
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2) // due in 2 days
    }
  });

  await prisma.commitment.create({
    data: {
      teamId: u.teamId,
      ownerId: u.id,
      meetingId: meeting.id,
      text: 'Review the latest PRs before deployment',
      status: 'FULFILLED',
      confidenceScore: 0.88,
      dueDate: new Date(Date.now() - 1000 * 60 * 60 * 24), // due 1 day ago
      resolvedAt: new Date(Date.now() - 1000 * 60 * 60 * 12) // fulfilled 12h ago
    }
  });

  await prisma.commitment.create({
    data: {
      teamId: u.teamId,
      ownerId: u.id,
      meetingId: meeting.id,
      text: 'Draft the team update email',
      status: 'PENDING',
      confidenceScore: 0.92,
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5) // due in 5 days
    }
  });

  console.log("Seeded 3 commitments for user!");
}

run().catch(console.error).finally(() => prisma.$disconnect());
