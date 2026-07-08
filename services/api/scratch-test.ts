import { Queue } from 'bullmq';
const q = new Queue('extract');
async function run() {
  const failed = await q.getFailed();
  if (failed.length > 0) {
    await failed[0].retry();
    console.log("Retried job " + failed[0].id);
  }
  process.exit(0);
}
run();
