import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const teams = await prisma.team.findMany({ include: { meetings: { select: { status: true, id: true } } } });
  for (const t of teams) {
    const statuses: Record<string, number> = {};
    t.meetings.forEach((m: any) => { statuses[m.status] = (statuses[m.status]||0)+1; });
    console.log(t.slug, '=>', statuses, 'meetingsUsed:', t.meetingsUsed);
  }
}
main().catch(console.error).finally(()=>prisma.$disconnect());
