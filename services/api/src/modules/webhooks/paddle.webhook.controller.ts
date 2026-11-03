import type { Request, Response } from 'express'
import { logger } from '../../config/logger'
import { redis } from '../../config/redis'
import { billingWebhookQueue } from '../../queues/queue.client'
import { INBOX_STATUS, recordIncomingEvent } from './paddle.inbox.repository'
import { parsePaddleDate } from './paddle.mapper'

/**
 * POST /webhooks/paddle
 *
 *   1. Verify the Paddle-Signature over the RAW body with the official SDK (HMAC-SHA256, 5 s timestamp window).
 *   2. Persist the event in Postgres (paddle_webhook_events, UNIQUE event_id).  ← durability point
 *   3. Best-effort enqueue for immediate processing.
 *   4. Reply 200.
 *
 * HTTP 200 therefore means "durably stored", not "processed". If step 2 fails we return 500 and Paddle
 * redelivers. If step 3 fails the event is still safe: the redrive sweeper re-enqueues it.
 */
export async function handlePaddleWebhook(req: Request, res: Response): Promise<void> {
  const PADDLE_WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET

  if (!PADDLE_WEBHOOK_SECRET || PADDLE_WEBHOOK_SECRET.trim() === '') {
    logger.error('[paddle.webhook.controller] REJECTED: PADDLE_WEBHOOK_SECRET is not configured on the server')
    res.status(500).json({ error: 'Webhook secret is not configured' })
    return
  }

  const signatureHeader = req.headers['paddle-signature'] as string | undefined
  const rawBody = (req as any).rawBody as Buffer | undefined

  if (!signatureHeader || !rawBody) {
    logger.warn({ hasSignature: !!signatureHeader, hasRawBody: !!rawBody, ip: req.ip }, '[paddle.webhook.controller] REJECTED: missing Paddle-Signature header or raw body')
    res.status(400).json({ error: 'Invalid request' })
    return
  }

  let event: any
  try {
    const { paddle } = await import('../../services/paddle.client')
    event = await paddle.webhooks.unmarshal(rawBody.toString('utf8'), PADDLE_WEBHOOK_SECRET, signatureHeader)
  } catch (err: any) {
    // Never log any part of the signature/secret.
    logger.error({ err: err.message, ip: req.ip }, '[paddle.webhook.controller] SECURITY: signature verification FAILED')
    res.status(400).json({ error: 'PADDLE_WEBHOOK_INVALID_SIGNATURE' })
    return
  }

  const eventId = (event?.eventId || event?.event_id || event?.id) as string | undefined
  const eventType = (event?.eventType || event?.event_type || event?.type) as string | undefined

  if (!eventId && !eventType) {
    logger.info({ ip: req.ip }, '[paddle.webhook.controller] Paddle test/ping webhook — acknowledging')
    res.status(200).json({ received: true })
    return
  }
  if (!eventId || !eventType) {
    logger.warn({ ip: req.ip }, '[paddle.webhook.controller] Webhook payload missing eventId or eventType — rejecting')
    res.status(400).json({ error: 'Malformed event' })
    return
  }

  // Persist the verified RAW payload (snake_case, exactly as Paddle sent it), not the SDK object.
  let payload: unknown
  try {
    payload = JSON.parse(rawBody.toString('utf8'))
  } catch {
    res.status(400).json({ error: 'Malformed JSON' })
    return
  }
  const occurredAt = parsePaddleDate((payload as any)?.occurred_at ?? event?.occurredAt) ?? null

  let recorded: { created: boolean; status: string }
  try {
    recorded = await recordIncomingEvent({ eventId, eventType, occurredAt, payload })
  } catch (dbErr: any) {
    logger.error({ err: dbErr.message, eventId, eventType, alert: 'billing.webhook_persist_failed' }, '[paddle.webhook.controller] ❌ could not persist webhook — returning 500 so Paddle retries')
    res.status(500).json({ error: 'Failed to persist webhook event' })
    return
  }

  redis.set('paddle:last_webhook_received_at', Date.now().toString()).catch(() => undefined)

  if (!recorded.created && (recorded.status === INBOX_STATUS.PROCESSED || recorded.status === INBOX_STATUS.IGNORED)) {
    logger.info({ eventId, eventType }, '[paddle.webhook.controller] duplicate delivery of an already-processed event — acknowledged')
    res.status(200).json({ received: true, eventId, duplicate: true })
    return
  }

  try {
    // BullMQ forbids ':' in custom job IDs (it rejects the add) — keep this colon-free.
    await billingWebhookQueue.add(
      'process-paddle-event',
      { eventId, eventType, receivedAt: new Date().toISOString() },
      { jobId: `paddle-evt-${eventId}` }
    )
  } catch (queueErr: any) {
    logger.error({ err: queueErr.message, eventId, eventType }, '[paddle.webhook.controller] enqueue failed — event is stored, redrive sweeper will pick it up')
  }

  res.status(200).json({ received: true, eventId })
}
