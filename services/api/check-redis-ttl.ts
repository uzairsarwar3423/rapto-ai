import { redis } from './src/config/redis';

async function check() {
  const ttl = await redis.ttl('paddle:event:evt_01kwvvjjm8qnhwes2pj9gyevh1');
  console.log("TTL for evt_01kwvvjjm8qnhwes2pj9gyevh1:", ttl, "seconds");
  const age = 86400 - ttl;
  console.log("Age:", age, "seconds", "(", age / 60, "minutes )");
  process.exit(0);
}
check();
