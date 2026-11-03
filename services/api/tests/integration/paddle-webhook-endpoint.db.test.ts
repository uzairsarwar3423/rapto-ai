/**
 * The webhook HTTP endpoint end-to-end: REAL Paddle SDK signature verification, REAL Postgres inbox,
 * BullMQ's REAL job-id validation. Only Redis/BullMQ transport is stubbed.
 */
import '../support/billing-test-env'
import crypto from 'node:crypto'
import express from 'express'
import request from 'supertest'
import { PlanType } from '@prisma/client'
import { prisma, makeTeam, resetBillingTables } from '../support/billing-db'
import { DAY, envelope, subscription, uid } from '../support/paddle-fixtures'

jest.mock('../../src/config/redis', () => ({ redis: require('../support/fake-redis').createFakeRedis() }))
jest.mock('../../src/queues/queue.client', () => {
  const { assertBullMqAcceptsJobId } = require('../support/bullmq-validate')
  const mk = () =>
    jest.fn(async (_n: string, _d: any, opts?: { jobId?: string }) => {
      if (opts?.jobId) assertBullMqAcceptsJobId(opts.jobId)
      return { id: opts?.jobId }
    })
  return { notifyQueue: { add: mk() }, billingWebhookQueue: { add: mk() } }
})
jest.mock('../../src/realtime/socket.emitter', () => ({ socketEmitter: { to: () => ({ emit: jest.fn() }) } }))

import { billingWebhookQueue } from '../../src/queues/queue.client'
import { webhookRoutes } from '../../src/modules/webhooks/webhooks.routes'
import { processInboxEvent } from '../../src/modules/webhooks/paddle.event-processor'
import { redriveInboxEvents } from '../../src/modules/billing/subscription-lifecycle.service'

jest.setTimeout(60_000)

const SECRET = process.env.PADDLE_WEBHOOK_SECRET!
const app = express()
app.use('/api/v1/webhooks', webhookRoutes)

function sign(body: string, opts: { secret?: string; ts?: number } = {}) {
  const ts = opts.ts ?? Math.floor(Date.now() / 1000)
  const h1 = crypto.createHmac('sha256', opts.secret ?? SECRET).update(`${ts}:${body}`).digest('hex')
  return `ts=${ts};h1=${h1}`
}

const post = (body: string, signature?: string) => {
  const r = request(app).post('/api/v1/webhooks/paddle').set('Content-Type', 'application/json')
  if (signature) r.set('Paddle-Signature', signature)
  return r.send(body)
}

const queueAdd = billingWebhookQueue.add as jest.Mock

beforeAll(async () => {
  await resetBillingTables()
  // Warm the lazily-imported Paddle client so cold ts-jest compilation does not eat the SDK's 5 s signature window.
  await import('../../src/services/paddle.client')
})
beforeEach(() => jest.clearAllMocks())
afterAll(async () => {
  await prisma.$disconnect()
})

describe('POST /webhooks/paddle — verification', () => {
  const unhandled = () => JSON.stringify(envelope('customer.created', { id: uid('ctm'), email: 'x@y.z' }))

  it('accepts a correctly signed event, stores it durably BEFORE acknowledging, and enqueues with a BullMQ-valid job id', async () => {
    const body = unhandled()
    const evtId = JSON.parse(body).event_id
    const res = await post(body, sign(body))

    expect(res.status).toBe(200)
    const row = await prisma.paddleWebhookEvent.findUniqueOrThrow({ where: { eventId: evtId } })
    expect(row.status).toBe('RECEIVED')
    expect(row.eventType).toBe('customer.created')
    expect(queueAdd).toHaveBeenCalledWith('process-paddle-event', expect.objectContaining({ eventId: evtId }), { jobId: `paddle-evt-${evtId}` })
  })

  it('rejects a forged signature (wrong secret) with 400 and persists/enqueues nothing', async () => {
    const body = unhandled()
    const evtId = JSON.parse(body).event_id
    const res = await post(body, sign(body, { secret: 'attacker-secret' }))
    expect(res.status).toBe(400)
    expect(await prisma.paddleWebhookEvent.count({ where: { eventId: evtId } })).toBe(0)
    expect(queueAdd).not.toHaveBeenCalled()
  })

  it('rejects a tampered body', async () => {
    const body = unhandled()
    const sig = sign(body)
    const tampered = body.replace('x@y.z', 'evil@y.z')
    const res = await post(tampered, sig)
    expect(res.status).toBe(400)
    expect(queueAdd).not.toHaveBeenCalled()
  })

  it('rejects a replayed request outside the 5 second timestamp window', async () => {
    const body = unhandled()
    const res = await post(body, sign(body, { ts: Math.floor(Date.now() / 1000) - 120 }))
    expect(res.status).toBe(400)
    expect(await prisma.paddleWebhookEvent.count({ where: { eventId: JSON.parse(body).event_id } })).toBe(0)
  })

  it('rejects a missing signature header', async () => {
    const res = await post(unhandled())
    expect(res.status).toBe(400)
  })

  it('forged webhook claiming to upgrade a team does nothing', async () => {
    const t = await makeTeam({ plan: 'FREE' })
    const body = JSON.stringify(envelope('subscription.created', subscription({ id: uid('sub'), status: 'active', customerId: t.paddleCustomerId!, teamId: t.id, periodStart: new Date(), periodEnd: new Date(Date.now() + 30 * DAY) })))
    const res = await post(body, 'ts=1;h1=deadbeef')
    expect(res.status).toBe(400)
    expect((await prisma.team.findUniqueOrThrow({ where: { id: t.id } })).plan).toBe(PlanType.FREE)
  })
})

describe('POST /webhooks/paddle — durability & idempotency', () => {
  it('a redelivery of the same event_id collapses to ONE inbox row and is acknowledged', async () => {
    const body = JSON.stringify(envelope('customer.updated', { id: uid('ctm') }))
    const evtId = JSON.parse(body).event_id
    const a = await post(body, sign(body))
    const b = await post(body, sign(body))
    expect([a.status, b.status]).toEqual([200, 200])
    expect(await prisma.paddleWebhookEvent.count({ where: { eventId: evtId } })).toBe(1)
  })

  it('a redelivery of an already PROCESSED event is acknowledged as duplicate without re-enqueueing', async () => {
    const body = JSON.stringify(envelope('customer.updated', { id: uid('ctm') }))
    const evtId = JSON.parse(body).event_id
    await post(body, sign(body))
    await processInboxEvent(evtId)
    queueAdd.mockClear()

    const res = await post(body, sign(body))
    expect(res.status).toBe(200)
    expect(res.body.duplicate).toBe(true)
    expect(queueAdd).not.toHaveBeenCalled()
  })

  it('database unavailable ⇒ 500 (Paddle will redeliver); nothing is acknowledged that is not stored', async () => {
    const spy = jest.spyOn(prisma.paddleWebhookEvent, 'create').mockRejectedValueOnce(new Error('db down'))
    const body = JSON.stringify(envelope('customer.created', { id: uid('ctm') }))
    const res = await post(body, sign(body))
    expect(res.status).toBe(500)
    expect(queueAdd).not.toHaveBeenCalled()
    spy.mockRestore()

    const retry = await post(body, sign(body)) // Paddle redelivers once the DB is back
    expect(retry.status).toBe(200)
  })

  it('queue (Redis) outage does NOT lose the event: 200 because it is stored; the redrive sweeper recovers it', async () => {
    queueAdd.mockRejectedValueOnce(new Error('redis down'))
    const body = JSON.stringify(envelope('customer.created', { id: uid('ctm') }))
    const evtId = JSON.parse(body).event_id
    const res = await post(body, sign(body))
    expect(res.status).toBe(200)
    expect((await prisma.paddleWebhookEvent.findUniqueOrThrow({ where: { eventId: evtId } })).status).toBe('RECEIVED')

    queueAdd.mockClear()
    const redriven = await redriveInboxEvents(new Date(Date.now() + 5 * 60 * 1000))
    expect(redriven).toBeGreaterThanOrEqual(1)
    expect(queueAdd).toHaveBeenCalledWith('process-paddle-event', expect.objectContaining({ eventId: evtId }), { jobId: `paddle-evt-${evtId}-r0` })
  })

  it('redrive falls back to in-process handling when the queue itself is down', async () => {
    const body = JSON.stringify(envelope('customer.created', { id: uid('ctm') }))
    const evtId = JSON.parse(body).event_id
    queueAdd.mockRejectedValueOnce(new Error('redis down'))
    await post(body, sign(body))

    queueAdd.mockRejectedValue(new Error('redis still down'))
    await redriveInboxEvents(new Date(Date.now() + 5 * 60 * 1000))
    queueAdd.mockReset()
    expect((await prisma.paddleWebhookEvent.findUniqueOrThrow({ where: { eventId: evtId } })).status).toBe('IGNORED')
  })

  it('full path: signed subscription.created over HTTP → inbox → processor → plan activated exactly once', async () => {
    const t = await makeTeam({ plan: 'FREE' })
    const evt = envelope('subscription.created', subscription({ id: uid('sub'), status: 'active', customerId: t.paddleCustomerId!, teamId: t.id, periodStart: new Date(), periodEnd: new Date(Date.now() + 30 * DAY) }))
    const body = JSON.stringify(evt)

    expect((await post(body, sign(body))).status).toBe(200)
    expect((await post(body, sign(body))).status).toBe(200) // redelivered before processing
    const [r1, r2] = await Promise.all([processInboxEvent(evt.event_id), processInboxEvent(evt.event_id)])
    expect([r1.skipped, r2.skipped].sort()).toEqual([false, true])

    expect((await prisma.team.findUniqueOrThrow({ where: { id: t.id } })).plan).toBe(PlanType.STARTER)
    expect(await prisma.billingAuditLog.count({ where: { eventId: evt.event_id } })).toBe(1)
  })
})
