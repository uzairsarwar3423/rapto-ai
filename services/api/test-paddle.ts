import { paddle } from './src/services/paddle.client';
import { prisma } from './src/db/client';

async function test() {
  try {
    const transaction = await paddle.transactions.create({
      customerId: 'ctm_01kwvvjjm45jyde15zestzxw4h',
      items: [{ priceId: 'pri_01kww0ypsdf73pdrzh1q8xebf8', quantity: 1 }], // dummy priceId, might fail differently
      customData: {
        teamId: 'cmr91tvwb000dh2ajv379ofgu',
        planId: 'STARTER',
        interval: 'month',
      },
      checkout: {
        url: 'http://localhost:3000',
      },
    });
    console.log("Success!", transaction);
  } catch (err) {
    console.error("Error:", err);
  }
}
test();
