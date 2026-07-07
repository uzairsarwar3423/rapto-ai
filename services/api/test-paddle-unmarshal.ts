import { Paddle, Environment } from '@paddle/paddle-node-sdk';

const paddle = new Paddle('dummy', { environment: Environment.sandbox });
console.log("unmarshal length:", paddle.webhooks.unmarshal.length);
console.log("unmarshal name:", paddle.webhooks.unmarshal.name);
