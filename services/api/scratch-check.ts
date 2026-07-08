import { Queue } from 'bullmq';
const q = new Queue('extract');
async function check() {
  const failed = await q.getFailed();
  const waiting = await q.getWaiting();
  const active = await q.getActive();
  console.log(`Failed: ${failed.length}, Waiting: ${waiting.length}, Active: ${active.length}`);
  process.exit(0);
}
check();
