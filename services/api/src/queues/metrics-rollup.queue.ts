import { Queue } from 'bullmq'
import { redisConnectionOptions } from '../config/redis.config'

const connection = {
  host: redisConnectionOptions.host,
  port: redisConnectionOptions.port,
  password: redisConnectionOptions.password,
}

export const METRICS_ROLLUP_QUEUE = 'metrics-rollup'
export const DEBOUNCE_MS = 30_000

// Failed rollups are retained (bounded) so they can be inspected; the nightly job self-heals today's row anyway.
export const metricsRollupQueue = new Queue(METRICS_ROLLUP_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10_000 },
    removeOnComplete: true,
    removeOnFail: { count: 100 },
  },
})

/**
 * Debounced "refresh today" trigger.
 *
 * A burst of billing events inside the same 30s window shares ONE job id, and BullMQ ignores an add() whose id
 * already exists — so 10 events in 5s create exactly one recompute, which runs ~30s after the burst begins.
 *
 * The window index is part of the id (instead of one fixed id) on purpose: with a fixed id, an event that arrives
 * WHILE the job is running would be silently swallowed (the active job still owns the id) and its change would not
 * reach the dashboard until the nightly job. With per-window ids that event simply opens the next window.
 * Two adjacent windows may each run a job — harmless: the rollup is idempotent and the worker is serialized.
 *
 * `now` is injectable for deterministic tests.
 */
export function enqueueRecomputeToday(now: number = Date.now()) {
  const window = Math.floor(now / DEBOUNCE_MS)
  return metricsRollupQueue.add('recompute-today', {}, { jobId: `rollup-recompute-today-${window}`, delay: DEBOUNCE_MS })
}

/** Billing events that change subscription state or revenue — the only ones worth a dashboard refresh. */
const REFRESH_EVENT_PREFIXES = ['subscription.', 'transaction.', 'adjustment.']

/**
 * Called by the billing WORKER after its DB transaction has committed (never from the HTTP webhook handler — at that
 * point the subscription row may not be written yet and the rollup would read stale state).
 *
 * The catch is intentional: a rollup-enqueue failure must NEVER fail or retry the billing event itself. Billing
 * correctness outranks dashboard freshness, and the nightly job self-heals today's row regardless.
 */
export async function enqueueRecomputeForBillingEvent(eventType: string, logger: { warn: (o: object, m: string) => void }): Promise<void> {
  if (!REFRESH_EVENT_PREFIXES.some((p) => eventType.startsWith(p))) return
  try {
    await enqueueRecomputeToday()
  } catch (err: any) {
    logger.warn({ err: err?.message, eventType }, 'metrics rollup enqueue failed — nightly job will still correct today')
  }
}

/** Idempotent: upsertJobScheduler never creates a duplicate schedule, so calling this on every worker boot is safe. */
export async function registerNightlyRollup(): Promise<void> {
  await metricsRollupQueue.upsertJobScheduler(
    'rollup-nightly',
    { pattern: '15 0 * * *', tz: 'UTC' },
    {
      name: 'nightly',
      opts: { attempts: 3, backoff: { type: 'exponential', delay: 60_000 }, removeOnComplete: { count: 30 }, removeOnFail: { count: 100 } },
    },
  )
}
