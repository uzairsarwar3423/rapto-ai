const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Starting Subscription Health & Auto-Repair...');

  // 1. Repair trialing subscriptions with missing trial dates or unit amounts
  const trialing = await prisma.subscription.findMany({
    where: {
      status: 'trialing',
      OR: [
        { trialStart: null },
        { trialEnd: null },
        { unitAmount: null },
      ],
    },
  });

  console.log(`Found ${trialing.length} trialing subscriptions requiring repair.`);

  for (const sub of trialing) {
    const trialStart = sub.trialStart || sub.currentPeriodStart || sub.createdAt || new Date();
    const trialEnd = sub.trialEnd || sub.currentPeriodEnd || new Date(trialStart.getTime() + 14 * 24 * 60 * 60 * 1000);
    const unitAmount = sub.unitAmount || (sub.plan === 'STARTER' ? 4900 : sub.plan === 'GROWTH' ? 9900 : sub.plan === 'BUSINESS' ? 19900 : 4900);

    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        trialStart,
        trialEnd,
        unitAmount,
      },
    });

    console.log(`  ✅ Repaired subscription ${sub.id} (Team: ${sub.teamId}) -> trial: [${trialStart.toISOString()} - ${trialEnd.toISOString()}], unitAmount: ${unitAmount}`);
  }

  // 2. Output all current subscriptions
  const allSubs = await prisma.subscription.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      teamId: true,
      plan: true,
      status: true,
      trialStart: true,
      trialEnd: true,
      unitAmount: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      paddleSubscriptionId: true,
    },
  });

  console.log('\n📊 All Subscriptions Summary:');
  console.table(allSubs);
}

main()
  .catch((err) => {
    console.error('❌ Repair failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
