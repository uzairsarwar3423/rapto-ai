import type { Request, Response } from 'express'
import { logger } from '../../config/logger'
import { redis } from '../../config/redis'
import { billingWebhookQueue } from '../../queues/queue.client'

export async function handlePaddleWebhook(req: Request, res: Response): Promise<void> {
  const PADDLE_WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET

  if (!PADDLE_WEBHOOK_SECRET || PADDLE_WEBHOOK_SECRET.trim() === '') {
    logger.error('[paddle.webhook.controller] REJECTED: PADDLE_WEBHOOK_SECRET is not configured on the server')
    res.status(500).json({ error: 'Webhook secret is not configured' })
    return
  }

  // ── Step 1: Validate raw body + signature header presence ──────────────────
  const signatureHeader = req.headers['paddle-signature'] as string
  const rawBody = (req as any).rawBody as Buffer

  if (!signatureHeader || !rawBody) {
    logger.warn(
      { hasSignature: !!signatureHeader, hasRawBody: !!rawBody, ip: req.ip },
      '[paddle.webhook.controller] REJECTED: missing Paddle-Signature header or raw body'
    )
    res.status(400).json({ error: 'Invalid request' })
    return
  }

  // ── Step 2: Cryptographic signature verification via official Paddle SDK ───
  let event: any
  try {
    const { paddle } = await import('../../services/paddle.client')
    event = await paddle.webhooks.unmarshal(
      rawBody.toString('utf8'),
      PADDLE_WEBHOOK_SECRET,
      signatureHeader
    )
  } catch (err: any) {
    logger.error(
      { err: err.message, ip: req.ip, signatureHeader: signatureHeader.substring(0, 40) },
      '[paddle.webhook.controller] SECURITY: Paddle signature verification FAILED — invalid signature or misconfigured secret'
    )
    res.status(400).json({ error: 'PADDLE_WEBHOOK_INVALID_SIGNATURE' })
    return
  }

  const eventId = (event?.eventId || event?.event_id || event?.id) as string | undefined
  const eventType = (event?.eventType || event?.event_type || event?.type) as string | undefined

  // Paddle sends a ping when first saving webhook URL in the dashboard
  if (!eventId && !eventType) {
    logger.info(
      { eventKeys: Object.keys(event || {}), ip: req.ip },
      '[paddle.webhook.controller] Received Paddle test/ping webhook — acknowledging'
    )
    res.status(200).json({ received: true })
    return
  }

  if (!eventId || !eventType) {
    logger.warn(
      { eventKeys: Object.keys(event || {}), ip: req.ip },
      '[paddle.webhook.controller] Webhook payload missing eventId or eventType — rejecting'
    )
    res.status(400).json({ error: 'Malformed event' })
    return
  }

  // Record last webhook receipt timestamp for monitoring
  try {
    await redis.set('paddle:last_webhook_received_at', Date.now().toString())
  } catch (err: any) {
    logger.warn({ err: err.message }, '[paddle.webhook.controller] Failed to update last_webhook_received_at metric')
  }

  // ── Step 3: Enqueue into persistent BullMQ queue with deterministic jobId ──
  // Exactly-once processing guarantee: BullMQ rejects duplicate active/waiting jobIds
  // and retains failed jobs durably across container restarts without losing events.
  try {
    const jobId = `paddle-evt:${eventId}`
    await billingWebhookQueue.add(
      'process-paddle-event',
      {
        event,
        eventId,
        eventType,
        receivedAt: new Date().toISOString(),
      },
      {
        jobId,
      }
    )

    logger.info(
      { eventId, eventType, jobId, ip: req.ip },
      '[paddle.webhook.controller] ✅ Event verified and durably queued for processing'
    )

    // Fast-ack to Paddle now that the event is safely persisted in Redis queue
    res.status(200).json({ received: true, eventId })
  } catch (queueErr: any) {
    logger.error(
      { err: queueErr.message, eventId, eventType },
      '[paddle.webhook.controller] ❌ Failed to persist webhook event into BullMQ queue'
    )
    res.status(500).json({ error: 'Failed to persist webhook event' })
  }
}
