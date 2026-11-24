import { Request, Response } from 'express'
import { logger } from '../../config/logger'
import { transcribeQueue, notifyQueue } from '../../queues/queue.client'
import { mongoService } from '../../services/mongo.service'
import { redis } from '../../config/redis'
import { prisma } from '../../db/client'
import { verifyRecallSignature } from './webhooks.validator'
import { ExtractJobData } from '../../queues/jobs/extract.job'
import { updateMeetingStatus } from '../meetings/meetings.service'
import { TERMINAL_STATES } from '../meetings/meetings.service.state'
import { getTranscript } from '../../services/recall.service'
import { normalizeRecallTranscript, type NormalizedUtterance } from '../../services/recall-transcript'

export { normalizeRecallTranscript, type NormalizedUtterance }

// ─────────────────────────────────────────────────────────────────────────────
// Recall.ai webhook handler
//
// Event names follow https://docs.recall.ai/docs/bot-status-change-events and
// https://docs.recall.ai/docs/recording-webhooks. Payload envelope:
//   { event, data: { data: { code, sub_code, updated_at }, bot: { id, metadata },
//                    transcript?: { id }, recording?: { id } } }
//
// Delivery semantics: the event is processed BEFORE we answer. On failure we
// release the idempotency claim and answer 5xx, so Recall.ai retries (it retries
// non-2xx for 24h). A duplicate that arrives while the first copy is still being
// processed gets 503 (retry later) — never a premature 200 that would lose it.
// ─────────────────────────────────────────────────────────────────────────────

const IDEMPOTENCY_DONE_TTL_S = 86_400
/** Longer than any realistic processing time; a crashed worker frees the claim after this. */
const IDEMPOTENCY_PROCESSING_TTL_S = 300

export async function handleRecallWebhook(req: Request, res: Response): Promise<void> {
  // 1. Verify signature FIRST — reject immediately if invalid
  try {
    verifyRecallSignature(req)
  } catch (error) {
    logger.warn({ error }, 'Recall.ai webhook signature verification failed')
    res.status(400).json({ received: false, error: 'Invalid signature' })
    return
  }

  const { event, data } = req.body ?? {}
  const botId: string | undefined = data?.bot?.id || data?.bot_id

  if (!botId) {
    logger.warn({ event }, 'Recall webhook missing bot ID in payload — ignoring')
    res.status(400).json({ received: false, error: 'Missing bot_id' })
    return
  }

  // 2. Idempotency: claim the event before processing it
  const idempotencyKey = `webhook:processed:recall:${botId}:${event}`
  const claimed = await redis.set(idempotencyKey, 'processing', 'EX', IDEMPOTENCY_PROCESSING_TTL_S, 'NX')
  if (!claimed) {
    const state = await redis.get(idempotencyKey).catch(() => null)
    if (state === 'processing') {
      logger.info({ event, botId }, 'Recall webhook is already being processed — asking Recall to retry later')
      res.status(503).json({ received: false, error: 'Processing in progress' })
      return
    }
    logger.info({ event, botId }, 'Recall webhook already processed — skipping')
    res.status(200).json({ received: true })
    return
  }

  // 3. Process, then acknowledge
  try {
    await routeRecallEvent(event, data, botId)
    await redis.set(idempotencyKey, 'done', 'EX', IDEMPOTENCY_DONE_TTL_S).catch((err) =>
      logger.warn({ err, event, botId }, 'Failed to mark Recall webhook as processed')
    )
    res.status(200).json({ received: true })
  } catch (err) {
    logger.error({ event, botId, err }, 'Error processing Recall.ai webhook — releasing claim for retry')
    await redis.del(idempotencyKey).catch(() => {})
    res.status(500).json({ received: false, error: 'Processing failed' })
  }
}

async function routeRecallEvent(event: string, data: any, botId: string): Promise<void> {
  switch (event) {
    case 'bot.joining_call':
      return handleBotJoining(botId)
    case 'bot.in_waiting_room':
      logger.info({ botId }, 'Bot in waiting room')
      return
    case 'bot.in_call_recording':
    case 'bot.recording_started': // legacy alias — not a documented Recall.ai event
      return handleRecordingStarted(botId)
    case 'bot.done':
      return handleBotDone(data, botId)
    case 'bot.fatal':
    case 'bot.failed': // legacy alias — Recall.ai's documented failure event is bot.fatal
      return handleBotFailed(botId, getStatusSubCode(data) ?? 'Recall.ai bot failed')
    case 'transcript.done':
    case 'analysis_done': // legacy aliases — not documented Recall.ai events
    case 'analyze_done':
    case 'bot.analysis_done':
      return handleTranscriptDone(botId)
    case 'transcript.failed':
      return handleTranscriptFailed(botId, getStatusSubCode(data))
    default:
      logger.info({ event, botId }, 'Unhandled Recall.ai event — ignoring')
  }
}

/** Documented location is data.data.sub_code; older payload shapes are kept as fallbacks. */
function getStatusSubCode(data: any): string | null {
  return data?.data?.sub_code ?? data?.data?.code ?? data?.reason ?? data?.bot?.status?.sub_code ?? null
}

// ── EVENT HANDLERS ────────────────────────────────────────────────────────────
// Socket.io updates are emitted by updateMeetingStatus() — handlers never re-emit.

async function handleBotJoining(botId: string): Promise<void> {
  const meeting = await findMeetingByBotId(botId)
  if (!meeting || TERMINAL_STATES.has(meeting.status)) return
  if (meeting.status !== 'SCHEDULED') return // late/out-of-order delivery — already past this state
  await updateMeetingStatus(meeting.id, 'BOT_JOINING')
}

async function handleRecordingStarted(botId: string): Promise<void> {
  const meeting = await findMeetingByBotId(botId)
  if (!meeting || TERMINAL_STATES.has(meeting.status)) return
  if (meeting.status !== 'SCHEDULED' && meeting.status !== 'BOT_JOINING') return // out-of-order delivery
  await updateMeetingStatus(meeting.id, 'RECORDING', { startedAt: new Date() })
}

async function handleBotDone(_data: any, botId: string): Promise<void> {
  const meeting = await findMeetingByBotId(botId)
  if (!meeting) {
    logger.error({ botId }, 'bot.done received for unknown bot')
    return
  }
  if (TERMINAL_STATES.has(meeting.status)) {
    logger.info({ meetingId: meeting.id, status: meeting.status }, 'Meeting already in terminal state, ignoring bot.done')
    return
  }
  if (meeting.mongoTranscriptId) {
    logger.info({ meetingId: meeting.id }, 'bot.done already handled for this meeting — ignoring')
    return
  }

  const now = new Date()
  const durationMinutes = meeting.startedAt
    ? Math.round((now.getTime() - meeting.startedAt.getTime()) / 60000)
    : 0

  // bot.done means the media exists, but the transcript artifact can finish later
  // (Recall.ai sends transcript.done). A fetch failure here is not fatal: we
  // still record that the meeting ended, and transcript.done picks it up.
  let rawTranscript: any[] = []
  try {
    rawTranscript = await getTranscript(botId)
  } catch (err) {
    logger.warn({ meetingId: meeting.id, botId, err }, 'Transcript not retrievable at bot.done — waiting for transcript.done')
  }

  const normalizedTranscript = normalizeRecallTranscript(rawTranscript)
  const mongoTranscriptId = await mongoService.storeTranscript({
    meeting_id: meeting.id,
    team_id: meeting.teamId,
    recall_bot_id: botId,
    platform: meeting.platform?.toLowerCase() || 'unknown',
    raw_transcript: rawTranscript,
    normalized_transcript: normalizedTranscript,
    full_text: buildFullText(normalizedTranscript),
    processing_status: 'pending',
    created_at: new Date(),
  })

  await updateMeetingStatus(meeting.id, 'PROCESSING', {
    endedAt: now,
    durationMinutes,
    mongoTranscriptId,
  })

  if (rawTranscript.length > 0) {
    await enqueueTranscriptProcessing(meeting.id, meeting.teamId, mongoTranscriptId)
  } else {
    logger.info({ meetingId: meeting.id }, 'Transcript not ready at bot.done, waiting for transcript.done')
  }
}

async function handleBotFailed(botId: string, reason: string): Promise<void> {
  const meeting = await findMeetingByBotId(botId)
  if (!meeting || TERMINAL_STATES.has(meeting.status)) return
  await updateMeetingStatus(meeting.id, 'FAILED', { processingError: reason })

  await notifyQueue.add('meeting-failed', {
    type: 'MEETING_FAILED',
    teamId: meeting.teamId,
    meetingId: meeting.id,
  })
}

async function handleTranscriptDone(botId: string): Promise<void> {
  const meeting = await findMeetingByBotId(botId)
  if (!meeting) return
  logger.info({ meetingId: meeting.id, botId }, 'Received transcript.done from Recall.ai')

  if (meeting.status !== 'PROCESSING') {
    if (TERMINAL_STATES.has(meeting.status) || meeting.mongoTranscriptId) {
      // Already ingested (and possibly cleaned/extracted) — never overwrite it.
      logger.info({ meetingId: meeting.id, status: meeting.status }, 'Transcript already ingested — ignoring transcript.done')
      return
    }
    // bot.done hasn't been processed yet. Fail so Recall.ai redelivers this event
    // after it; bot.done itself will also find the (now finished) transcript.
    throw new Error(`transcript.done before bot.done for meeting ${meeting.id} — retry later`)
  }
  if (!meeting.mongoTranscriptId) {
    throw new Error(`Meeting ${meeting.id} is PROCESSING without a transcript document — retry later`)
  }

  const existing = await mongoService.findTranscript(meeting.mongoTranscriptId)
  if (Array.isArray(existing?.raw_transcript) && existing.raw_transcript.length > 0) {
    logger.info({ meetingId: meeting.id }, 'Transcript already ingested at bot.done — ignoring transcript.done')
    return
  }

  // Throws on download failure → 5xx → Recall.ai retries.
  const rawTranscript = await getTranscript(botId)
  if (rawTranscript.length === 0) {
    logger.warn({ meetingId: meeting.id }, 'transcript.done but the transcript is empty — nothing to process')
    return
  }

  const normalizedTranscript = normalizeRecallTranscript(rawTranscript)
  await mongoService.updateTranscript(meeting.mongoTranscriptId, {
    raw_transcript: rawTranscript,
    normalized_transcript: normalizedTranscript,
    full_text: buildFullText(normalizedTranscript),
  })
  logger.info({ meetingId: meeting.id, segments: rawTranscript.length }, 'Late transcript saved')

  await enqueueTranscriptProcessing(meeting.id, meeting.teamId, meeting.mongoTranscriptId)
}

async function handleTranscriptFailed(botId: string, subCode: string | null): Promise<void> {
  const meeting = await findMeetingByBotId(botId)
  if (!meeting || TERMINAL_STATES.has(meeting.status)) return
  if (meeting.status !== 'PROCESSING' && meeting.status !== 'RECORDING') return // already past transcription

  if (meeting.mongoTranscriptId) {
    const doc = await mongoService.findTranscript(meeting.mongoTranscriptId)
    if (Array.isArray(doc?.raw_transcript) && doc.raw_transcript.length > 0) return // we have a transcript
  }

  const reason = `Transcription failed${subCode ? `: ${subCode}` : ''}`
  logger.warn({ meetingId: meeting.id, botId, subCode }, reason)
  await handleBotFailed(botId, reason)
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

async function findMeetingByBotId(botId: string) {
  return prisma.meeting.findFirst({
    where: { recallBotId: botId },
  })
}

/**
 * One transcript-processing pipeline run per meeting from Recall.ai webhooks.
 * bot.done and transcript.done can both carry the transcript; the deterministic
 * jobId makes BullMQ ignore the second add, so extraction never runs twice.
 * (Manual reprocessing enqueues its own job and is unaffected.)
 */
async function enqueueTranscriptProcessing(meetingId: string, teamId: string, mongoTranscriptId: string) {
  await transcribeQueue.add(
    'process-transcript',
    { meetingId, teamId, mongoTranscriptId } satisfies ExtractJobData,
    { priority: 2, jobId: `recall-transcript-${meetingId}` }
  )
}

function buildFullText(normalizedTranscript: NormalizedUtterance[]): string {
  return normalizedTranscript
    .map((t) => `${t.speaker} [${formatTime(t.startTime)}]: ${t.text}`)
    .join('\n')
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
