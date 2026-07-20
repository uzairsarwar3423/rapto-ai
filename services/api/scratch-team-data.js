const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const users = await prisma.user.findMany({ select: { id: true, email: true, teamId: true }});
  console.log("Users:", users.map(u => u.email + ' -> team ' + u.teamId));

  const teamIds = [...new Set(users.map(u => u.teamId))];
  for (const teamId of teamIds) {
    const count = await prisma.commitment.count({ where: { teamId } });
    const c = await prisma.commitment.findFirst({ where: { teamId }, orderBy: { createdAt: 'desc' } });
    console.log(`Team ${teamId} has ${count} commitments. Latest: ${c?.createdAt}`);
  }
}
run().catch(console.error).finally(() => prisma.$disconnect());
