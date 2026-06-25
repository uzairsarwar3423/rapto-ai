const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding demo commitments for testing...");

  // 1. Get existing team
  const team = await prisma.team.findFirst({
    where: { slug: "techflow-eng" }
  });

  if (!team) {
    console.error("❌ Team techflow-eng not found. Please run the main seed first: npm run prisma:seed");
    process.exit(1);
  }

  // 2. Get users
  const users = await prisma.user.findMany({
    where: { teamId: team.id }
  });

  if (users.length === 0) {
    console.error("❌ No users found for team. Please run main seed first.");
    process.exit(1);
  }

  // 3. Get meetings
  const meetings = await prisma.meeting.findMany({
    where: { teamId: team.id }
  });

  if (meetings.length === 0) {
    console.error("❌ No meetings found for team. Please run main seed first.");
    process.exit(1);
  }

  const now = new Date();

  // 4. Generate 25 more commitments to test pagination, counts, overrides
  const demoCommitmentsData = [];
  const commitmentTexts = [
    "Refactor auth middleware to support MFA validation",
    "Design database indices for query performance optimization",
    "Write unit tests for the mutation cache patcher hook",
    "Update API docs with the new team invitations schemas",
    "Prepare security assessment report for the compliance team",
    "Implement debounce utility inside search input component",
    "Deploy staging cluster using latest ECS container image",
    "Analyze redis latency spikes during peak traffic hours",
    "Configure email notification dispatcher with nodemailer fallback",
    "Review code coverage reports and add missing tests",
    "Refactor layout grid styling to support fluid breakpoints",
    "Verify stripe webhooks response and check signature key",
    "Optimize page assets bundle size using next compile",
    "Integrate zoom webhooks listener for scheduled meetings",
    "Investigate memory leaks in persistent socket connections",
    "Update tailwind configurations for new theme colors",
    "Setup database migration checks inside github actions pipeline",
    "Review PR from product manager regarding billing interval",
    "Fix timezone offset issue in meeting scheduled date",
    "Add input validation helper inside new forms modal",
    "Implement focus trap on sheet component for accessibility",
    "Create visual performance chart for dashboard summary",
    "Debug user invite link email routing latency issue",
    "Add tooltip guidelines for manual commitment overrides",
    "Document API error codes in the developers manual"
  ];

  const statuses = ["PENDING", "FULFILLED", "MISSED", "DEFERRED", "CANCELLED"];

  for (let i = 0; i < commitmentTexts.length; i++) {
    const owner = users[i % users.length];
    const status = statuses[i % statuses.length];
    
    // Distribute due dates (some past, some future)
    let dueDate = new Date();
    if (status === "PENDING") {
      dueDate.setDate(now.getDate() + (i % 7) + 1); // Future
    } else if (status === "MISSED") {
      dueDate.setDate(now.getDate() - (i % 5) - 1); // Past
    } else {
      dueDate.setDate(now.getDate() + (i % 3) - 1); // Mixed
    }

    demoCommitmentsData.push({
      teamId: team.id,
      meetingId: meetings[i % meetings.length].id,
      ownerId: owner.id,
      text: commitmentTexts[i],
      status: status,
      dueDate: dueDate,
      confidenceScore: parseFloat((0.75 + (i % 5) * 0.05).toFixed(2)),
      deferredCount: status === "DEFERRED" ? (i % 3) + 1 : 0,
      deferredNote: status === "DEFERRED" ? `Deferred because of priority shift in sprint ${i}` : null,
      cancellationNote: status === "CANCELLED" ? `Cancelled due to scope reduction in epic ${i}` : null,
      createdAt: new Date(now.getTime() - i * 60 * 60 * 1000) // Staggered creation times
    });
  }

  // Insert into DB
  console.log("🧹 Deleting existing commitments to have a clean seed...");
  await prisma.commitment.deleteMany({
    where: { teamId: team.id }
  });

  // Recreate the seed ones + our 25 new ones
  const baseSeedCommitments = [
    {
      teamId: team.id,
      meetingId: meetings[0].id,
      ownerId: users[0].id,
      text: "Ali will finish the schema migration by tonight",
      status: "FULFILLED",
      dueDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      resolvedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      confidenceScore: 0.95,
    },
    {
      teamId: team.id,
      meetingId: meetings[0].id,
      ownerId: users[1].id,
      text: "Sara will prepare the presentation slides",
      status: "PENDING",
      dueDate: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
      confidenceScore: 0.88,
    },
    {
      teamId: team.id,
      meetingId: meetings[0].id,
      ownerId: users[2].id,
      text: "Ahmed will deploy the container to ECS",
      status: "MISSED",
      dueDate: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      confidenceScore: 0.91,
    }
  ];

  await prisma.commitment.createMany({
    data: [...baseSeedCommitments, ...demoCommitmentsData]
  });

  console.log(`✅ Successfully seeded ${baseSeedCommitments.length + demoCommitmentsData.length} commitments for testing!`);
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
