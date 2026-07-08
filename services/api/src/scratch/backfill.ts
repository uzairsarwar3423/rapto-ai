import { PrismaClient } from '@prisma/client';
import { redis } from '../config/redis';

const prisma = new PrismaClient();

async function main() {
  const teams = await prisma.team.findMany({
    select: { id: true, slug: true, meetingsUsed: true, billingCycleStart: true }
  });

  for (const team of teams) {
    const meetingFilter: any = {
      teamId: team.id,
      status: { in: ['DONE', 'RESOLVED'] },
    };
    
    if (team.billingCycleStart) {
      meetingFilter.createdAt = { gte: team.billingCycleStart };
    }

    const doneCount = await prisma.meeting.count({
      where: meetingFilter
    });
    
    if (team.meetingsUsed !== doneCount) {
      await prisma.team.update({
        where: { id: team.id },
        data: { meetingsUsed: doneCount }
      });
      // Invalidate cache
      await redis.del(`cache:team:plan:${team.id}`);
      console.log(`Updated team ${team.slug}: ${team.meetingsUsed} -> ${doneCount}`);
    }
  }
}

main().catch(console.error).finally(() => {
  prisma.$disconnect();
  redis.quit();
});
