import type { Request, Response } from 'express'
import { logger } from '../../config/logger'
import { redis } from '../../config/redis'
import * as paddleWebhookService from './paddle.webhook.service'

export async function handlePaddleWebhook(req: Request, res: Response): Promise<void> {
  const PADDLE_WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET ?? ''
  
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

  // ── Step 2: Signature verification via official Paddle SDK ─────────────────
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
      '[paddle.webhook.controller] SECURITY: Paddle signature verification FAILED — possible replay attack or misconfigured secret'
    )
    res.status(400).json({ error: 'PADDLE_WEBHOOK_INVALID_SIGNATURE' })
    return
  }

  const eventId   = (event?.eventId   || event?.event_id   || event?.id)   as string | undefined
  const eventType = (event?.eventType || event?.event_type || event?.type)  as string | undefined

  // Paddle sends a ping when you first save the webhook URL in the dashboard
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

  // ── Step 3: Idempotency check (Layer 1 — Redis, 24h TTL) ──────────────────
  const idempotencyKey = `paddle:event:${eventId}`
  const isNew = await redis.set(idempotencyKey, '1', 'EX', 86400, 'NX')
  if (!isNew) {
    logger.info(
      { eventId, eventType },
      '[paddle.webhook.controller] IDEMPOTENT SKIP: event already processed within 24h — no-op'
    )
    res.status(200).json({ received: true })
    return
  }

  await redis.set('paddle:last_webhook_received_at', Date.now().toString())

  logger.info(
    { eventId, eventType, ip: req.ip },
    '[paddle.webhook.controller] ✅ Signature verified and event accepted — fast-acking Paddle'
  )

  // ── Step 4: Fast-ack — return 200 IMMEDIATELY before any async work ────────
  res.status(200).json({ received: true })

  // ── Step 5: Route to handler (async, AFTER ack) ────────────────────────────
  setImmediate(async () => {
    const handlerStart = Date.now()
    try {
      logger.info({ eventId, eventType }, '[paddle.webhook.controller] ▶ Processing event asynchronously')
      await paddleWebhookService.processEvent(event, eventId, eventType)
      logger.info(
        { eventId, eventType, durationMs: Date.now() - handlerStart },
        '[paddle.webhook.controller] ✅ Event processed successfully'
      )
    } catch (err: any) {
      logger.error(
        { err: err.message, stack: err.stack, eventId, eventType, durationMs: Date.now() - handlerStart },
        '[paddle.webhook.controller] ❌ CRITICAL: Unhandled error in async event handler'
      )
    }
  })
}
