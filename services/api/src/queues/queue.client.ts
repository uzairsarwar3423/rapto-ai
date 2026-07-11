import { Queue, QueueEvents } from 'bullmq'
import { redis } from '../config/redis'
import { logger } from '../config/logger'

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  password: process.env.REDIS_PASSWORD,
}

// transcribe: Recall.ai webhook → /transcripts/cleanup → extract queue
// removeOnFail: false — failed jobs MUST be retained for debugging and manual replay
export const transcribeQueue = new Queue('transcribe', {
  connection,
  defaultJobOptions: {
    attempts:         3,
    backoff:          { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 100 },
    removeOnFail:     false,  // Never auto-remove failed jobs — they must be inspectable
  },
})

// extract: cleaned transcript → /extract → commitments/actions in PostgreSQL
// 10s base backoff — OpenAI rate limits need more recovery time
export const extractQueue = new Queue('extract', {
  connection,
  defaultJobOptions: {
    attempts:         3,
    backoff:          { type: 'exponential', delay: 10_000 },
    priority:         2,
    removeOnComplete: { count: 100 },
    removeOnFail:     false,  // Never auto-remove failed jobs
  },
})

// notify: Send email / Slack notifications
export const notifyQueue = new Queue('notify', {
  connection,
  defaultJobOptions: {
    attempts:    5,
    backoff:     { type: 'exponential', delay: 5_000 },
    priority:    3,
    removeOnComplete: { count: 200 },
    removeOnFail:     { count: 50 },
  },
})

// integrate: Sync to Jira / Linear / Notion
export const integrateQueue = new Queue('integrate', {
  connection,
  defaultJobOptions: {
    attempts:    3,
    backoff:     { type: 'exponential', delay: 20_000 },
    priority:    4,
    removeOnComplete: { count: 100 },
    removeOnFail:     { count: 50 },
  },
})

// deadline: Cron-based — check overdue commitments
export const deadlineQueue = new Queue('deadline', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    removeOnComplete: { count: 10 },
    removeOnFail:     { count: 10 },
  },
})

// calendar-sync: Sync Google Calendar
export const calendarSyncQueue = new Queue('calendar-sync', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff:     { type: 'exponential', delay: 30_000 },
    removeOnComplete: { count: 100 },
    removeOnFail:     { count: 50 },
  },
})

// resolve: new commitments + historical → /resolve → FULFILLED status updates
// 5s base backoff — resolve calls are faster than extract
export const resolveQueue = new Queue('resolve', {
  connection,
  defaultJobOptions: {
    attempts:         3,
    backoff:          { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 200 },
    removeOnFail:     false,  // Never auto-remove failed jobs
  },
})

// token-refresh: refresh OAuth tokens for integrations
export const tokenRefreshQueue = new Queue('token-refresh', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
})

const queues = [transcribeQueue, extractQueue, resolveQueue, notifyQueue, integrateQueue, deadlineQueue, calendarSyncQueue, tokenRefreshQueue]

queues.forEach((q) => {
  const events = new QueueEvents(q.name, { connection })
  events.on('failed',    ({ jobId, failedReason }) => {
    logger.error({ queue: q.name, jobId, failedReason }, 'Job failed')
  })
  events.on('completed', ({ jobId }) => {
    logger.debug({ queue: q.name, jobId }, 'Job completed')
  })
})
