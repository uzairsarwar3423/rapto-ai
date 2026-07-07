import { Paddle, Environment } from '@paddle/paddle-node-sdk';
const paddle = new Paddle('dummy');
paddle.webhooks.unmarshal('body', 'secret', 'signature');
