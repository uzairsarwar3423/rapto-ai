import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function check() {
  const meeting = await prisma.meeting.findUnique({
    where: { id: 'cmrak9bhg000hh2hkpd76iedk' },
    include: {
      participants: true,
      creator: true
    }
  })
  
  if (!meeting) {
    console.log("Meeting not found!")
    return
  }

  console.log("Meeting Title:", meeting.title)
  console.log("Creator:", meeting.creator?.name, meeting.creator?.email, "ID:", meeting.creatorId)
  console.log("Participants List:", meeting.participants)
  
  // also check if Uzair is in the DB
  const users = await prisma.user.findMany({
    where: { name: { contains: "Uzair" } }
  })
  console.log("Users with name 'Uzair':", users.map(u => ({ id: u.id, name: u.name, email: u.email })))
}

check().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); })
