import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const meeting = await prisma.meeting.findUnique({
    where: { id: 'cmrkrkczk0009h22i7040jkp8' },
    include: { participants: true }
  })
  console.log(JSON.stringify(meeting?.participants, null, 2))
}
main().catch(console.error).finally(() => prisma.$disconnect())
