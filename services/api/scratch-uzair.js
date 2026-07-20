const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const u = await prisma.user.findFirst({ where: { email: 'uzairsarwar3423@gmail.com' } });
  console.log("User:", u.email, u.teamId);

  if (u.teamId) {
    const c = await prisma.commitment.count({ where: { teamId: u.teamId } });
    console.log("Commitments for team:", c);
  }
}
run().catch(console.error).finally(() => prisma.$disconnect());
