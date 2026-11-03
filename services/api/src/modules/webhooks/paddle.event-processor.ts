// ─────────────────────────────────────────────────────────────────────────────
// paddle.event-processor.ts — runs ONE inbox event exactly-once-effectively.
//
//   claim (atomic)  →  handler  →  PROCESSED | IGNORED | NEEDS_ATTENTION   (success, never retried)
//                              →  UnresolvableEventError                  (NEEDS_ATTENTION, never retried, alert)
//                              →  any other error                          (FAILED + rethrow ⇒ BullMQ / redrive retry)
// ─────────────────────────────────────────────────────────────────────────────

import { logger } from '../../config/logger'
import { claimEvent, markFailed, markProcessed } from './paddle.inbox.repository'
import { processEvent } from './paddle.webhook.service'
import { UnresolvableEventError } from './paddle.mapper'

export interface InboxProcessResult {
  skipped: boolean
  status?: string
}

export async function processInboxEvent(eventId: string): Promise<InboxProcessResult> {
  const row = await claimEvent(eventId)
  if (!row) {
    // Already processed, ignored, flagged, or currently owned by another live worker.
    return { skipped: true }
  }

  try {
    const outcome = await processEvent(row.payload, row.eventId, row.eventType)
    await markProcessed(row.eventId, outcome.status, outcome.teamId, outcome.note)
    if (outcome.status === 'NEEDS_ATTENTION') {
      logger.error({ eventId, eventType: row.eventType, teamId: outcome.teamId, note: outcome.note, alert: 'billing.needs_attention' }, '[paddle.event-processor] event needs operator attention')
    }
    return { skipped: false, status: outcome.status }
  } catch (err: any) {
    if (err instanceof UnresolvableEventError) {
      await markProcessed(row.eventId, 'NEEDS_ATTENTION', err.teamId, err.message)
      logger.error({ eventId, eventType: row.eventType, err: err.message, alert: 'billing.unresolvable_event' }, '[paddle.event-processor] ALERT: unresolvable event — stored for manual review, not retried')
      return { skipped: false, status: 'NEEDS_ATTENTION' }
    }
    await markFailed(row.eventId, err?.message ?? String(err)).catch(() => undefined)
    throw err
  }
}
