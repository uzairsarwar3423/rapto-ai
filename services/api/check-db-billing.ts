import { prisma } from './src/db/client';

async function check() {
  const subs = await prisma.subscription.findMany({ where: { teamId: 'cmr91tvwb000dh2ajv379ofgu' } });
  const invoices = await prisma.invoice.findMany({ where: { teamId: 'cmr91tvwb000dh2ajv379ofgu' } });
  console.log("Subs:", subs);
  console.log("Invoices:", invoices);
  process.exit(0);
}
check();
