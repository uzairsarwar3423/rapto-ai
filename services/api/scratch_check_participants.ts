import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function check() {
  const meetingId = 'cmr3c7ogr000fh2obb68je1pc' // from the most recent error
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { participants: true }
  })
  console.log(JSON.stringify(meeting, null, 2))
  
  const meetingId2 = 'cmr3bx6dj0009h2ob7rw5s5dj'
  const meeting2 = await prisma.meeting.findUnique({
    where: { id: meetingId2 },
    include: { participants: true }
  })
  console.log(JSON.stringify(meeting2, null, 2))
}

check().catch(console.error).finally(() => prisma.$disconnect())
