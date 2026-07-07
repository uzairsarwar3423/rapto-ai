import { Queue } from 'bullmq';
const connection = { host: 'localhost', port: 6379 };
const extractQueue = new Queue('extract', { connection });
async function main() {
  const waiting = await extractQueue.getWaitingCount();
  const active = await extractQueue.getActiveCount();
  const delayed = await extractQueue.getDelayedCount();
  const failed = await extractQueue.getFailedCount();
  console.log(`Extract Queue - Waiting: ${waiting}, Active: ${active}, Delayed: ${delayed}, Failed: ${failed}`);
  if (failed > 0) {
    const jobs = await extractQueue.getFailed(0, 5);
    jobs.forEach((j: any) => console.log('Failed reason:', j?.failedReason, '\nStack:', j?.stacktrace));
  }
  process.exit(0);
}
main();
