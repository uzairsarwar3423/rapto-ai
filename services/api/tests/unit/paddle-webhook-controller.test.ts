import type { Request, Response } from 'express'
import { handlePaddleWebhook } from '../../src/modules/webhooks/paddle.webhook.controller'
import { billingWebhookQueue } from '../../src/queues/queue.client'
import { redis } from '../../src/config/redis'

jest.mock('../../src/config/redis', () => ({
  redis: {
    set: jest.fn().mockResolvedValue('OK'),
  },
}))

jest.mock('../../src/queues/queue.client', () => ({
  billingWebhookQueue: {
    add: jest.fn().mockResolvedValue({ id: 'job_123' }),
  },
}))

jest.mock('../../src/services/paddle.client', () => ({
  paddle: {
    webhooks: {
      unmarshal: jest.fn(),
    },
  },
}))

describe('paddle.webhook.controller — Signature & Queue Ingestion', () => {
  let req: Partial<Request>
  let res: Partial<Response>
  let statusMock: jest.Mock
  let jsonMock: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.PADDLE_WEBHOOK_SECRET = 'pdl_ntfset_01h8q5test'

    jsonMock = jest.fn()
    statusMock = jest.fn().mockReturnValue({ json: jsonMock })
    res = {
      status: statusMock,
      json: jsonMock,
    }
  })

  it('rejects with 400 when paddle-signature header is missing', async () => {
    req = {
      headers: {},
      rawBody: Buffer.from(JSON.stringify({ event_id: 'evt_123' })),
    } as any

    await handlePaddleWebhook(req as Request, res as Response)

    expect(statusMock).toHaveBeenCalledWith(400)
    expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid request' })
  })

  it('rejects with 400 when Paddle SDK signature verification fails', async () => {
    const { paddle } = await import('../../src/services/paddle.client')
    ;(paddle.webhooks.unmarshal as jest.Mock).mockRejectedValue(new Error('Invalid signature'))

    req = {
      headers: { 'paddle-signature': 'ts=123;h1=invalid_hash' },
      rawBody: Buffer.from(JSON.stringify({ event_id: 'evt_123' })),
    } as any

    await handlePaddleWebhook(req as Request, res as Response)

    expect(statusMock).toHaveBeenCalledWith(400)
    expect(jsonMock).toHaveBeenCalledWith({ error: 'PADDLE_WEBHOOK_INVALID_SIGNATURE' })
  })

  it('acknowledges Paddle test/ping webhook with 200 without queueing', async () => {
    const { paddle } = await import('../../src/services/paddle.client')
    ;(paddle.webhooks.unmarshal as jest.Mock).mockResolvedValue({})

    req = {
      headers: { 'paddle-signature': 'ts=123;h1=valid_hash' },
      rawBody: Buffer.from(JSON.stringify({})),
    } as any

    await handlePaddleWebhook(req as Request, res as Response)

    expect(statusMock).toHaveBeenCalledWith(200)
    expect(jsonMock).toHaveBeenCalledWith({ received: true })
    expect(billingWebhookQueue.add).not.toHaveBeenCalled()
  })

  it('enqueues verified webhook payload with deterministic jobId and returns 200', async () => {
    const { paddle } = await import('../../src/services/paddle.client')
    const validEvent = {
      eventId: 'evt_test_999',
      eventType: 'transaction.completed',
      data: { id: 'txn_001' },
    }
    ;(paddle.webhooks.unmarshal as jest.Mock).mockResolvedValue(validEvent)

    req = {
      headers: { 'paddle-signature': 'ts=123;h1=valid_hash' },
      rawBody: Buffer.from(JSON.stringify(validEvent)),
    } as any

    await handlePaddleWebhook(req as Request, res as Response)

    expect(billingWebhookQueue.add).toHaveBeenCalledWith(
      'process-paddle-event',
      expect.objectContaining({
        eventId: 'evt_test_999',
        eventType: 'transaction.completed',
        event: validEvent,
      }),
      expect.objectContaining({
        jobId: 'paddle-evt:evt_test_999',
      })
    )

    expect(statusMock).toHaveBeenCalledWith(200)
    expect(jsonMock).toHaveBeenCalledWith({ received: true, eventId: 'evt_test_999' })
  })
})
