import { prisma } from "../db/client";

async function main() {
  const meetingId = "cmrkrkczk0009h22i7040jkp8";
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, status: true, title: true }
  });
  console.log(meeting);
}

main().catch(console.error).finally(() => prisma.$disconnect());
