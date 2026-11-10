import { Worker, Job } from 'bullmq'
import { invalidateDashboardCache } from '../../modules/admin/metrics/dashboard-cache'
import { redisConnectionOptions } from '../../config/redis.config'
import { logger } from '../../config/logger'
import { metricsRollupService } from '../../modules/admin/metrics/metrics-rollup.service'
import { METRICS_ROLLUP_QUEUE } from '../metrics-rollup.queue'

const connection = {
  host: redisConnectionOptions.host,
  port: redisConnectionOptions.port,
  password: redisConnectionOptions.password,
}

export const metricsRollupWorker = new Worker(
  METRICS_ROLLUP_QUEUE,
  async (job: Job) => {
    const started = Date.now()
    const result =
      job.name === 'nightly' ? await metricsRollupService.finalizeNightly() : await metricsRollupService.recomputeToday()

    // A cache-invalidation failure must not fail (and retry) a rollup that already committed — the 5-minute cache TTL
    // is the backstop. Log it loudly instead.
    let invalidated = 0
    try {
      invalidated = await invalidateDashboardCache()
    } catch (err: any) {
      logger.error({ err: err.message, alert: 'metrics.cache_invalidation_failed' }, 'metrics rollup: cache invalidation failed')
    }

    logger.info({ job: job.name, ms: Date.now() - started, invalidated }, 'metrics rollup complete')
    return { job: job.name, invalidated }
  },
  {
    connection,
    // Serialized: snapshot replace + metrics upsert assume a single writer per process (and an advisory lock across processes).
    concurrency: 1,
  },
)

metricsRollupWorker.on('failed', (job, err) => {
  const exhausted = job ? job.attemptsMade >= (job.opts.attempts ?? 1) : false
  logger.error(
    { job: job?.name, err: err.message, attemptsMade: job?.attemptsMade, exhausted, alert: exhausted ? 'metrics.rollup_failed' : undefined },
    exhausted ? 'metrics rollup FAILED — retries exhausted' : 'metrics rollup attempt failed — will retry',
  )
})

metricsRollupWorker.on('error', (err) => {
  logger.error({ err: err.message }, 'metrics-rollup worker internal error')
})
