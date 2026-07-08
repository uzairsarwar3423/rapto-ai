import { Queue } from 'bullmq';
const q = new Queue('extract');
async function run() {
  const failed = await q.getFailed();
  console.log(`Failed jobs: ${failed.length}`);
  for (const job of failed) {
    console.log(`Retrying job ${job.id}`);
    await job.retry();
  }
  process.exit(0);
}
run();
