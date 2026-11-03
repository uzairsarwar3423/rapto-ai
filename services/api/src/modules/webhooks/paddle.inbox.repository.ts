// ─────────────────────────────────────────────────────────────────────────────
// paddle.inbox.repository.ts — durable webhook inbox (table paddle_webhook_events)
//
// Contract:
//   • recordIncomingEvent() is called BEFORE the HTTP 200 is sent to Paddle ⇒ "200" means "stored in Postgres".
//   • eventId UNIQUE ⇒ redeliveries collapse to one row, regardless of Redis/BullMQ state.
//   • claimEvent() is an atomic compare-and-set ⇒ at most one worker processes an event at a time; an event
//     already PROCESSED is never processed again.
// ─────────────────────────────────────────────────────────────────────────────

import { Prisma } from '@prisma/client'
import { prisma } from '../../db/client'

export const INBOX_STATUS = {
  RECEIVED: 'RECEIVED',
  PROCESSING: 'PROCESSING',
  PROCESSED: 'PROCESSED',
  FAILED: 'FAILED',
  NEEDS_ATTENTION: 'NEEDS_ATTENTION',
  IGNORED: 'IGNORED',
} as const

/** A worker that crashed mid-event leaves PROCESSING behind; after this long the event may be re-claimed. */
export const STALE_PROCESSING_MS = 10 * 60 * 1000
/** Redrive gives up (and alerts) after this many processing attempts. */
export const MAX_PROCESSING_ATTEMPTS = 20

export interface IncomingEvent {
  eventId: string
  eventType: string
  occurredAt: Date | null
  payload: unknown
}

export async function recordIncomingEvent(evt: IncomingEvent): Promise<{ created: boolean; status: string }> {
  try {
    const row = await prisma.paddleWebhookEvent.create({
      data: {
        eventId: evt.eventId,
        eventType: evt.eventType,
        occurredAt: evt.occurredAt,
        payload: evt.payload as Prisma.InputJsonValue,
      },
      select: { status: true },
    })
    return { created: true, status: row.status }
  } catch (err: any) {
    if (err?.code === 'P2002') {
      const existing = await prisma.paddleWebhookEvent.findUnique({
        where: { eventId: evt.eventId },
        select: { status: true },
      })
      return { created: false, status: existing?.status ?? INBOX_STATUS.RECEIVED }
    }
    throw err
  }
}

/**
 * Atomically move an event to PROCESSING. Returns the row, or null when it is already PROCESSED / IGNORED /
 * NEEDS_ATTENTION or currently being processed by a live worker.
 */
export async function claimEvent(eventId: string, now: Date = new Date()) {
  const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MS)
  const claimed = await prisma.paddleWebhookEvent.updateMany({
    where: {
      eventId,
      OR: [
        { status: { in: [INBOX_STATUS.RECEIVED, INBOX_STATUS.FAILED] } },
        { status: INBOX_STATUS.PROCESSING, updatedAt: { lt: staleBefore } },
      ],
    },
    data: { status: INBOX_STATUS.PROCESSING, attempts: { increment: 1 } },
  })
  if (claimed.count === 0) return null
  return prisma.paddleWebhookEvent.findUnique({ where: { eventId } })
}

export async function markProcessed(eventId: string, status: 'PROCESSED' | 'IGNORED' | 'NEEDS_ATTENTION', teamId?: string | null, note?: string) {
  await prisma.paddleWebhookEvent.update({
    where: { eventId },
    data: {
      status,
      teamId: teamId ?? undefined,
      lastError: note ? note.slice(0, 1000) : null,
      processedAt: new Date(),
    },
  })
}

export async function markFailed(eventId: string, error: string) {
  await prisma.paddleWebhookEvent.update({
    where: { eventId },
    data: { status: INBOX_STATUS.FAILED, lastError: error.slice(0, 1000) },
  })
}

/**
 * Events that need (re)processing and are not currently in flight on the queue:
 *  • RECEIVED older than `graceMs` (the enqueue after the DB insert failed, or Redis lost the job)
 *  • FAILED that the queue has given up on, spaced by exponential backoff on `attempts`
 *  • PROCESSING abandoned by a crashed worker
 */
export async function findRedrivableEvents(now: Date = new Date(), limit = 100, graceMs = 2 * 60 * 1000) {
  const candidates = await prisma.paddleWebhookEvent.findMany({
    where: {
      OR: [
        { status: INBOX_STATUS.RECEIVED, updatedAt: { lt: new Date(now.getTime() - graceMs) } },
        { status: INBOX_STATUS.FAILED, attempts: { lt: MAX_PROCESSING_ATTEMPTS } },
        { status: INBOX_STATUS.PROCESSING, updatedAt: { lt: new Date(now.getTime() - STALE_PROCESSING_MS) } },
      ],
    },
    orderBy: { receivedAt: 'asc' },
    take: limit * 2,
    select: { eventId: true, status: true, attempts: true, updatedAt: true, eventType: true },
  })
  // Backoff for FAILED: 1m, 2m, 4m … capped at 6h.
  return candidates
    .filter((e) => {
      if (e.status !== INBOX_STATUS.FAILED) return true
      const waitMs = Math.min(6 * 3600_000, 60_000 * 2 ** Math.max(0, e.attempts - 1))
      return now.getTime() - e.updatedAt.getTime() >= waitMs
    })
    .slice(0, limit)
}

export async function countInboxByStatus(): Promise<Record<string, number>> {
  const rows = await prisma.paddleWebhookEvent.groupBy({ by: ['status'], _count: { _all: true } })
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all]))
}

export async function findAttentionEvents(limit = 50) {
  return prisma.paddleWebhookEvent.findMany({
    where: { status: { in: [INBOX_STATUS.FAILED, INBOX_STATUS.NEEDS_ATTENTION] } },
    orderBy: { receivedAt: 'desc' },
    take: limit,
    select: { eventId: true, eventType: true, status: true, attempts: true, lastError: true, teamId: true, receivedAt: true, occurredAt: true },
  })
}
