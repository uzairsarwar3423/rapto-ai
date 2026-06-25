import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const teams = await prisma.team.findMany();
  for (const team of teams) {
    const doneCount = await prisma.meeting.count({
      where: {
        teamId: team.id,
        status: 'DONE',
      }
    });
    if (team.meetingsUsed !== doneCount) {
      await prisma.team.update({
        where: { id: team.id },
        data: { meetingsUsed: doneCount }
      });
      console.log(`Updated team ${team.slug}: ${team.meetingsUsed} -> ${doneCount}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
