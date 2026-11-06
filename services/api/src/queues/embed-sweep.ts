// ─────────────────────────────────────────────────────────────────────────────
// embed-sweep.ts — nightly safety net for the AI chat's knowledge base (RAG)
//
// The primary path is event-driven: extract.worker queues an embed job per finished meeting. This sweep catches whatever
// that path missed — an embed job that used up its 8 attempts, the AI service being down for a long stretch, a deploy
// that dropped a queued job, or Redis being flushed — by re-running the (idempotent, hash-diffed) incremental backfill
// for every team that had a meeting extracted recently. Teams with nothing new cost one cheap scan and no OpenAI calls.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from '../db/client'
import { logger } from '../config/logger'
import { env } from '../config/env'
import { embedQueue } from './queue.client'
import { EmbedJobData } from './jobs/embed.job'

/** Look back this many days for recently extracted meetings, and scan that many days of sources. */
export const SWEEP_WINDOW_DAYS = 3
/** Spread teams out so one tick does not queue every team's request at the same instant. */
const STAGGER_MS = 5_000
const MAX_STAGGER_MS = 10 * 60_000

export async function runEmbedSweepCron(now: Date = new Date()): Promise<{ teams: number; enqueued: number }> {
  if (!env.RAG_AUTO_EMBED_ENABLED) {
    logger.info('embed-sweep cron: RAG_AUTO_EMBED_ENABLED=false — skipping')
    return { teams: 0, enqueued: 0 }
  }

  const since = new Date(now.getTime() - SWEEP_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const rows = await prisma.meeting.findMany({
    where: {
      status: { in: ['EXTRACTED', 'EXTRACTED_PARTIAL'] },
      processingCompletedAt: { gte: since },
    },
    select: { teamId: true },
    distinct: ['teamId'],
  })

  const day = now.toISOString().slice(0, 10).replace(/-/g, '')
  let enqueued = 0

  for (const [i, { teamId }] of rows.entries()) {
    try {
      const data: EmbedJobData = { teamId, sinceDays: SWEEP_WINDOW_DAYS }
      await embedQueue.add('embed-sweep', data, {
        jobId: `embed-sweep-${teamId}-${day}`,        // one sweep job per team per day
        delay: Math.min(i * STAGGER_MS, MAX_STAGGER_MS),
      })
      enqueued++
    } catch (err: any) {
      logger.error({ err: err?.message, teamId }, 'embed-sweep cron: failed to enqueue team')
    }
  }

  logger.info({ teams: rows.length, enqueued, windowDays: SWEEP_WINDOW_DAYS }, 'embed-sweep cron: done')
  return { teams: rows.length, enqueued }
}
