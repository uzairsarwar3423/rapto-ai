import { Worker, Job } from 'bullmq'
import { logger } from '../../config/logger'
import { redisConnectionOptions } from '../../config/redis.config'
import type { BillingWebhookJobData } from '../jobs/billing-webhook.job'
import { processInboxEvent } from '../../modules/webhooks/paddle.event-processor'

const connection = {
  host: redisConnectionOptions.host,
  port: redisConnectionOptions.port,
  password: redisConnectionOptions.password,
}

export const billingWebhookWorker = new Worker<BillingWebhookJobData>(
  'billing-webhook',
  async (job: Job<BillingWebhookJobData>) => {
    const { eventId, eventType } = job.data
    const start = Date.now()
    logger.info({ jobId: job.id, eventId, eventType, attempt: job.attemptsMade + 1 }, '[billing-webhook.worker] ▶ processing')
    const result = await processInboxEvent(eventId)
    logger.info({ jobId: job.id, eventId, eventType, ...result, durationMs: Date.now() - start }, '[billing-webhook.worker] ✅ done')
    return result
  },
  {
    connection,
    concurrency: 5, // per-team ordering/serialization is enforced in Postgres (advisory lock), not here
  }
)

billingWebhookWorker.on('failed', (job: Job<BillingWebhookJobData> | undefined, err: Error) => {
  const exhausted = job ? job.attemptsMade >= (job.opts.attempts ?? 1) : false
  logger.error(
    { jobId: job?.id, eventId: job?.data?.eventId, eventType: job?.data?.eventType, err: err.message, attemptsMade: job?.attemptsMade, exhausted, alert: exhausted ? 'billing.webhook_retries_exhausted' : undefined },
    exhausted
      ? '[billing-webhook.worker] ⚠️ queue retries exhausted — the inbox redrive sweeper continues with backoff'
      : '[billing-webhook.worker] attempt failed — will retry'
  )
})

billingWebhookWorker.on('error', (err: Error) => {
  logger.error({ err: err.message }, '[billing-webhook.worker] Worker internal error')
})
