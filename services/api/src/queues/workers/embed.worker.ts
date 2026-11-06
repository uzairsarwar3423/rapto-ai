// ─────────────────────────────────────────────────────────────────────────────
// embed.worker.ts
// BullMQ worker: embed queue → AI service POST /api/v1/embeddings/backfill
//
// WHY: the AI chat answers only from the RAG store (Postgres `rag.embeddings`). Nothing writes to it unless something
// asks. extract.worker queues a job here once a meeting's commitments/decisions/summary are committed; this worker asks
// the AI service to (re)scan that team's recent sources and embed whatever is new or changed.
//
// SAFE TO RUN OFTEN: the AI service diffs by content hash, so unchanged sources cost no OpenAI call and no write.
// The scan window is "yesterday onward" (see sinceDate) — wide enough to cover the transcript (saved a little before
// extraction) and the extracted rows, small enough to stay cheap.
//
// OUTCOMES
//   started          → done (the AI service's own worker embeds in the background)
//   already_running  → retry later: a job for this team is running and may have started before this meeting's rows
//                      existed, so we must run once more after it finishes
//   disabled         → RAG is off on the AI service: nothing to do, and not an error
//   rejected (4xx)   → configuration/request problem retrying cannot fix: fail loudly (UnrecoverableError)
//   thrown           → network/5xx: BullMQ retries with the queue's backoff
//
// NEVER BLOCKS THE CORE FLOW: extract.worker enqueues this fire-and-forget; a failure here cannot fail extraction.
// ─────────────────────────────────────────────────────────────────────────────

import { Worker, Job, UnrecoverableError } from 'bullmq'
import { env } from '../../config/env'
import { logger } from '../../config/logger'
import { aipipelineClient } from '../../services/ai-pipeline/ai-pipeline.client'
import type { EmbeddingSourceType } from '../../services/ai-pipeline/ai-pipeline.types'
import { EmbedJobData } from '../jobs/embed.job'

export const EMBED_SOURCE_TYPES: EmbeddingSourceType[] = [
  'transcript_chunk',
  'summary',
  'commitment',
  'decision',
  'action_item',
]

/** UTC calendar day (YYYY-MM-DD) `days` × 24h before `now`: the incremental scan window (default 1 day). */
export function sinceDate(now: Date = new Date(), days = 1): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export async function processEmbedJob(job: Pick<Job<EmbedJobData>, 'id' | 'data'>): Promise<void> {
  const { meetingId, teamId, sinceDays } = job.data

  if (!env.RAG_AUTO_EMBED_ENABLED) {
    logger.info({ jobId: job.id, meetingId, teamId }, 'embed.worker: RAG_AUTO_EMBED_ENABLED=false — skipping')
    return
  }

  const result = await aipipelineClient.startEmbeddingBackfill({
    team_id:      teamId,
    source_types: EMBED_SOURCE_TYPES,
    since:        sinceDate(new Date(), sinceDays ?? 1),
    created_by:   `auto:${meetingId ?? 'sweep'}`,
  })

  switch (result.outcome) {
    case 'started':
      logger.info({ jobId: job.id, meetingId, teamId, embedJobId: result.jobId }, 'embed.worker: embedding job started')
      return

    case 'disabled':
      logger.info({ jobId: job.id, meetingId, teamId }, 'embed.worker: RAG is disabled on the AI service — skipping')
      return

    case 'already_running':
      // Throw so BullMQ re-runs us after backoff; by then the running job has finished.
      throw new Error(`embedding job already running for team ${teamId}; will retry`)

    case 'rejected':
      logger.error(
        { jobId: job.id, meetingId, teamId, status: result.status, code: result.code },
        'embed.worker: AI service rejected the embedding request — check RAG_SOURCE_DATABASE_URL / RAG_MONGO_DATABASE'
      )
      throw new UnrecoverableError(`AI service rejected embedding request (HTTP ${result.status} ${result.code ?? ''})`)
  }
}

export const embedWorker = new Worker<EmbedJobData>(
  'embed',
  async (job: Job<EmbedJobData>) => processEmbedJob(job),
  {
    connection: {
      host:     process.env.REDIS_HOST ?? 'localhost',
      port:     parseInt(process.env.REDIS_PORT ?? '6379', 10),
      password: process.env.REDIS_PASSWORD,
    },
    concurrency: parseInt(process.env.WORKER_CONCURRENCY_EMBED ?? '2', 10),
  }
)

embedWorker.on('failed', (job, err) => {
  logger.warn(
    { jobId: job?.id, meetingId: job?.data?.meetingId, attempt: job?.attemptsMade, err: err.message },
    'embed.worker: job failed'
  )
})
