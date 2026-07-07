import { redis } from './src/config/redis';

async function check() {
  const keys = await redis.keys('paddle:event:*');
  console.log("Paddle webhook events in Redis:", keys);
  process.exit(0);
}
check();
