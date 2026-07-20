const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
async function run() {
  const c = await prisma.commitment.count();
  console.log("Total commitments:", c);
  const earliest = await prisma.commitment.findFirst({ orderBy: { createdAt: 'asc' }});
  console.log("Earliest:", earliest?.createdAt);
  const latest = await prisma.commitment.findFirst({ orderBy: { createdAt: 'desc' }});
  console.log("Latest:", latest?.createdAt);
}
run().catch(console.error).finally(() => prisma.$disconnect());
