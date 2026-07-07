import { prisma } from './src/db/client';

async function check() {
  const teams = await prisma.team.findMany({
    select: { id: true, name: true, plan: true, paddleCustomerId: true }
  });
  console.log("Teams:", JSON.stringify(teams, null, 2));
}
check().catch(console.error).finally(() => process.exit());
