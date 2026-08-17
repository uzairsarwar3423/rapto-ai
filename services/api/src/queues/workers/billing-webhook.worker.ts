import { Worker, Job } from 'bullmq'
import { logger } from '../../config/logger'
import { redisConnectionOptions } from '../../config/redis.config'
import type { BillingWebhookJobData } from '../jobs/billing-webhook.job'
import * as paddleWebhookService from '../../modules/webhooks/paddle.webhook.service'

const connection = {
  host: redisConnectionOptions.host,
  port: redisConnectionOptions.port,
  password: redisConnectionOptions.password,
}

export const billingWebhookWorker = new Worker<BillingWebhookJobData>(
  'billing-webhook',
  async (job: Job<BillingWebhookJobData>) => {
    const { event, eventId, eventType } = job.data
    const start = Date.now()

    logger.info(
      { jobId: job.id, eventId, eventType, attempt: job.attemptsMade + 1 },
      '[billing-webhook.worker] ▶ Processing billing webhook job'
    )

    try {
      await paddleWebhookService.processEvent(event, eventId, eventType)
      const durationMs = Date.now() - start
      logger.info(
        { jobId: job.id, eventId, eventType, durationMs },
        '[billing-webhook.worker] ✅ Billing webhook processed successfully'
      )
      return { success: true, eventId, eventType, durationMs }
    } catch (err: any) {
      const durationMs = Date.now() - start
      logger.error(
        {
          jobId: job.id,
          eventId,
          eventType,
          err: err?.message,
          stack: err?.stack,
          durationMs,
          attemptsMade: job.attemptsMade + 1,
        },
        '[billing-webhook.worker] ❌ Billing webhook processing failed — will retry according to backoff policy'
      )
      throw err // Re-throw to trigger BullMQ exponential retry & backoff
    }
  },
  {
    connection,
    concurrency: 5,
  }
)

billingWebhookWorker.on('failed', (job: Job<BillingWebhookJobData> | undefined, err: Error) => {
  logger.error(
    {
      jobId: job?.id,
      eventId: job?.data?.eventId,
      eventType: job?.data?.eventType,
      err: err.message,
      stack: err.stack,
      attemptsMade: job?.attemptsMade,
    },
    '[billing-webhook.worker] ⚠️ Billing webhook job failed completely after all retries'
  )
})

billingWebhookWorker.on('completed', (job: Job<BillingWebhookJobData>) => {
  logger.info(
    {
      jobId: job.id,
      eventId: job.data.eventId,
      eventType: job.data.eventType,
    },
    '[billing-webhook.worker] ✅ Billing webhook job marked completed in queue'
  )
})

billingWebhookWorker.on('error', (err: Error) => {
  logger.error({ err: err.message }, '[billing-webhook.worker] Worker internal error')
})
