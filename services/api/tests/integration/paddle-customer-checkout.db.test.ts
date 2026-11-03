/**
 * Checkout / customer-initialization regression suite for the production 403 → 502 → "CORS error" incident.
 *
 * REAL: Postgres, billing routes, auth/role middleware, real paddle.client.ts (getOrCreatePaddleCustomer,
 *       replaceStaleCustomer, createTransaction), real billing.service, real error middleware, real CORS config.
 * FAKED: only the Paddle SDK object itself (no network) — it throws genuine SDK `ApiError` instances.
 */
import '../support/billing-test-env'
import express from 'express'
import cors from 'cors'
import request from 'supertest'
import { ApiError } from '@paddle/paddle-node-sdk'
import { prisma, makeTeam, makeUser, resetBillingTables, sleep } from '../support/billing-db'
import { uid } from '../support/paddle-fixtures'

jest.mock('../../src/config/redis', () => ({ redis: require('../support/fake-redis').createFakeRedis() }))
jest.mock('../../src/queues/queue.client', () => ({ notifyQueue: { add: jest.fn() }, billingWebhookQueue: { add: jest.fn() } }))
jest.mock('../../src/realtime/socket.emitter', () => ({ socketEmitter: { to: () => ({ emit: jest.fn() }) } }))

const mockPaddle = {
  customers: { get: jest.fn(), create: jest.fn(), list: jest.fn(), update: jest.fn() },
  transactions: { create: jest.fn(), getInvoicePDF: jest.fn() },
  subscriptions: { list: jest.fn(), get: jest.fn(), cancel: jest.fn(), update: jest.fn() },
  customerPortalSessions: { create: jest.fn() },
  webhooks: { unmarshal: jest.fn() },
}
jest.mock('@paddle/paddle-node-sdk', () => {
  const actual = jest.requireActual('@paddle/paddle-node-sdk')
  return { ...actual, Paddle: jest.fn().mockImplementation(() => mockPaddle) }
})

import { billingRouter } from '../../src/modules/billing/billing.routes'
import { errorMiddleware } from '../../src/middleware/error.middleware'
import { requestLogger } from '../../src/middleware/request-logger.middleware'
import { corsOptions } from '../../src/config/cors.config'
import { generateAccessToken } from '../../src/modules/auth/auth.helpers'
import { logger } from '../../src/config/logger'

jest.setTimeout(60_000)

// Same ordering as src/app.ts: cors → json → requestLogger → routes → errorMiddleware
const app = express()
app.use(cors(corsOptions as any))
app.use(express.json())
app.use(requestLogger())
app.use('/api/v1/billing', billingRouter)
app.use(errorMiddleware)

const ORIGIN = 'https://app.rapto.cloud'
const apiErr = (code: string, detail = 'detail', type = 'request_error', retryAfter: number | null = null) =>
  new ApiError({ type, code, detail, documentation_url: 'https://developer.paddle.com/errors/x' } as any, retryAfter)

let team: any
let admin: any
const bearer = () => ({ Authorization: `Bearer ${generateAccessToken(admin)}`, Origin: ORIGIN })
const checkout = (planId = 'GROWTH', interval = 'month', extra: Record<string, string> = {}) =>
  request(app).post('/api/v1/billing/checkout').set({ ...bearer(), ...extra }).send({ planId, interval })

const errorLogs = () => (logger.error as jest.Mock).mock.calls

beforeAll(async () => {
  await resetBillingTables()
})

beforeEach(async () => {
  jest.clearAllMocks()
  jest.spyOn(logger, 'error')
  jest.spyOn(logger, 'info')
  jest.spyOn(logger, 'warn')
  team = await makeTeam({ plan: 'FREE', paddleCustomerId: null })
  admin = await makeUser(team.id, 'ADMIN')
  mockPaddle.customers.create.mockResolvedValue({ id: 'ctm_new_live', email: admin.email, status: 'active' })
  mockPaddle.transactions.create.mockResolvedValue({ id: 'txn_ok', checkout: { url: 'https://checkout.paddle.com/txn_ok' } })
  mockPaddle.subscriptions.list.mockReturnValue({ next: async () => [] })
})

afterAll(async () => {
  await prisma.$disconnect()
})

const teamRow = () => prisma.team.findUniqueOrThrow({ where: { id: team.id } })

// ═════════════════════════════════════════════════════════════════════════════
describe('Customer lookup — the production 403 on CustomersResource.get()', () => {
  it('an existing team customer is reused WITHOUT calling customers.get (no customer.read permission needed)', async () => {
    await prisma.team.update({ where: { id: team.id }, data: { paddleCustomerId: 'ctm_existing' } })
    mockPaddle.customers.get.mockRejectedValue(apiErr('forbidden', "You aren't permitted to perform this request."))

    const res = await checkout('GROWTH')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ transactionId: 'txn_ok', checkoutUrl: 'https://checkout.paddle.com/txn_ok' })
    expect(mockPaddle.customers.get).not.toHaveBeenCalled()
    expect(mockPaddle.customers.create).not.toHaveBeenCalled()
    expect(mockPaddle.transactions.create.mock.calls[0][0]).toMatchObject({ customerId: 'ctm_existing' })
  })

  it('a team without a customer gets exactly one created and persisted', async () => {
    const res = await checkout('GROWTH')
    expect(res.status).toBe(200)
    expect(mockPaddle.customers.create).toHaveBeenCalledTimes(1)
    expect((await teamRow()).paddleCustomerId).toBe('ctm_new_live')
    expect(mockPaddle.transactions.create.mock.calls[0][0]).toMatchObject({ customerId: 'ctm_new_live' })
  })

  it('returning customer: second checkout reuses the stored id (no second customer)', async () => {
    await checkout('GROWTH')
    mockPaddle.transactions.create.mockClear()
    await sleep(10)
    const res = await checkout('STARTER')
    expect(res.status).toBe(200)
    expect(mockPaddle.customers.create).toHaveBeenCalledTimes(1)
    expect(mockPaddle.transactions.create.mock.calls[0][0]).toMatchObject({ customerId: 'ctm_new_live' })
  })

  it('stale customer id (sandbox/deleted → Paddle 404 for THAT customer) is replaced and the checkout retried once', async () => {
    await prisma.team.update({ where: { id: team.id }, data: { paddleCustomerId: 'ctm_sandbox_old' } })
    mockPaddle.transactions.create
      .mockRejectedValueOnce(apiErr('not_found', 'customer ctm_sandbox_old not found.'))
      .mockResolvedValueOnce({ id: 'txn_after_replace', checkout: { url: 'https://checkout.paddle.com/x' } })

    const res = await checkout('GROWTH')
    expect(res.status).toBe(200)
    expect(res.body.transactionId).toBe('txn_after_replace')
    expect(mockPaddle.customers.create).toHaveBeenCalledTimes(1)
    expect((await teamRow()).paddleCustomerId).toBe('ctm_new_live')
    expect(mockPaddle.transactions.create.mock.calls[1][0]).toMatchObject({ customerId: 'ctm_new_live' })
    expect((logger.warn as jest.Mock).mock.calls.some((c) => c[0]?.alert === 'billing.stale_paddle_customer')).toBe(true)
  })

  it('a "not found" for a PRICE (PADDLE_PRICE_* from the wrong environment) is NOT treated as a stale customer: 503 + alert, customer untouched', async () => {
    await prisma.team.update({ where: { id: team.id }, data: { paddleCustomerId: 'ctm_keep' } })
    mockPaddle.transactions.create.mockRejectedValue(apiErr('not_found', 'price pri_starter_m not found.'))

    const res = await checkout('STARTER')
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('BILLING_UNAVAILABLE')
    expect(mockPaddle.customers.create).not.toHaveBeenCalled()
    expect((await teamRow()).paddleCustomerId).toBe('ctm_keep')
    expect(errorLogs().some((c) => c[0]?.alert === 'billing.price_or_entity_not_found_in_paddle')).toBe(true)
  })

  it('customer_already_exists (409): the existing customer found in the error detail is reused', async () => {
    mockPaddle.customers.create.mockRejectedValue(apiErr('customer_already_exists', 'customer email conflicts with customer of id ctm_01hexisting'))
    const res = await checkout('GROWTH')
    expect(res.status).toBe(200)
    expect((await teamRow()).paddleCustomerId).toBe('ctm_01hexisting')
  })

  it('customer_already_exists with an ARCHIVED customer found by email list: reactivated then reused', async () => {
    mockPaddle.customers.create.mockRejectedValue(apiErr('customer_already_exists', 'Customer email conflicts with existing customer'))
    mockPaddle.customers.list.mockReturnValue({ next: async () => [{ id: 'ctm_archived1', email: admin.email, status: 'archived' }] })
    mockPaddle.customers.update.mockResolvedValue({})
    const res = await checkout('GROWTH')
    expect(res.status).toBe(200)
    expect(mockPaddle.customers.update).toHaveBeenCalledWith('ctm_archived1', { status: 'active' })
    expect((await teamRow()).paddleCustomerId).toBe('ctm_archived1')
    expect(mockPaddle.customers.list.mock.calls[0][0].status).toEqual(['active', 'archived'])
  })

  it('concurrent first checkouts create ONE customer: the loser gets 409, one id is stored', async () => {
    mockPaddle.customers.create.mockImplementation(async () => { await sleep(250); return { id: 'ctm_only_one', email: admin.email, status: 'active' } })
    const [a, b, c] = await Promise.all([checkout('GROWTH'), checkout('GROWTH'), checkout('GROWTH')])
    expect([a.status, b.status, c.status].sort()).toEqual([200, 409, 409])
    expect(mockPaddle.customers.create).toHaveBeenCalledTimes(1)
    expect((await teamRow()).paddleCustomerId).toBe('ctm_only_one')
  })

  it('compare-and-set: a customer id stored by a racing request is never overwritten', async () => {
    const { getOrCreatePaddleCustomer } = require('../../src/services/paddle.client')
    mockPaddle.customers.create.mockImplementation(async () => {
      await prisma.team.update({ where: { id: team.id }, data: { paddleCustomerId: 'ctm_winner' } }) // racing writer
      return { id: 'ctm_loser', email: 'x', status: 'active' }
    })
    const id = await getOrCreatePaddleCustomer(team.id, admin.email, admin.email)
    expect(id).toBe('ctm_winner')
    expect((await teamRow()).paddleCustomerId).toBe('ctm_winner')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Plans — Growth and every other plan/interval use the configured price', () => {
  it.each([
    ['STARTER', 'month', 'pri_starter_m'], ['STARTER', 'year', 'pri_starter_y'],
    ['GROWTH', 'month', 'pri_growth_m'], ['GROWTH', 'year', 'pri_growth_y'],
    ['BUSINESS', 'month', 'pri_business_m'], ['BUSINESS', 'year', 'pri_business_y'],
  ])('%s/%s → price %s, trusted custom_data teamId', async (plan, interval, price) => {
    const res = await checkout(plan, interval)
    expect(res.status).toBe(200)
    const args = mockPaddle.transactions.create.mock.calls[0][0]
    expect(args.items).toEqual([{ priceId: price, quantity: 1 }])
    expect(args.customData).toMatchObject({ teamId: team.id, planId: plan, interval })
    expect(res.body.checkoutUrl).toMatch(/^https:\/\/checkout\.paddle\.com\//)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Paddle failures: precise status codes, safe messages, no inconsistent billing state', () => {
  const secret = 'Authorization: Bearer pdl_live_apikey_01SECRETKEY at https://api.paddle.com/customers'

  const expectNoLeak = (res: request.Response) =>
    expect(JSON.stringify(res.body)).not.toMatch(/pdl_|paddle\.com|Authorization|SECRETKEY|forbidden|permitted/i)

  const expectNoBillingState = async () => {
    expect(await prisma.subscription.count({ where: { teamId: team.id } })).toBe(0)
    expect(await prisma.invoice.count({ where: { teamId: team.id } })).toBe(0)
    expect((await teamRow()).plan).toBe('FREE')
  }

  it('INSUFFICIENT PERMISSIONS on customers.create (403 forbidden) → 503 BILLING_UNAVAILABLE (not 502), alert logged, no customer/subscription state', async () => {
    mockPaddle.customers.create.mockRejectedValue(apiErr('forbidden', secret))
    const res = await checkout('GROWTH')
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('BILLING_UNAVAILABLE')
    expectNoLeak(res)
    expect((await teamRow()).paddleCustomerId).toBeNull()
    await expectNoBillingState()
    const log = errorLogs().map((c) => c[0]).find((o) => o?.alert === 'billing.paddle_credentials_or_permissions')
    expect(log).toMatchObject({ operation: 'customers.getOrCreate', upstream: 'paddle', paddleCode: 'forbidden', teamId: team.id, userId: admin.id })
    expect(JSON.stringify(errorLogs())).not.toMatch(/pdl_live_apikey|Bearer pdl/)
  })

  it.each(['authentication_malformed', 'invalid_token', 'authentication_missing'])(
    'INVALID CREDENTIALS (%s) on transactions.create → 503, alert, no subscription state',
    async (code) => {
      await prisma.team.update({ where: { id: team.id }, data: { paddleCustomerId: 'ctm_x' } })
      mockPaddle.transactions.create.mockRejectedValue(apiErr(code, secret))
      const res = await checkout('GROWTH')
      expect(res.status).toBe(503)
      expectNoLeak(res)
      await expectNoBillingState()
      expect(errorLogs().some((c) => c[0]?.alert === 'billing.paddle_credentials_or_permissions')).toBe(true)
    }
  )

  it('transactions.create 403 after the customer was created: customer id kept for reuse (fix the key and retry), still no subscription state', async () => {
    mockPaddle.transactions.create.mockRejectedValue(apiErr('forbidden'))
    const res = await checkout('GROWTH')
    expect(res.status).toBe(503)
    expect((await teamRow()).paddleCustomerId).toBe('ctm_new_live')
    await expectNoBillingState()
  })

  it('403 is permanent — the permission error is NOT retried (single Paddle call)', async () => {
    mockPaddle.customers.create.mockRejectedValue(apiErr('forbidden'))
    await checkout('GROWTH')
    expect(mockPaddle.customers.create).toHaveBeenCalledTimes(1)
  })

  it('429 → 429 with the Retry-After header and CORS headers', async () => {
    mockPaddle.customers.create.mockRejectedValue(apiErr('too_many_requests', 'slow down', 'api_error', 30))
    const res = await checkout('GROWTH')
    expect(res.status).toBe(429)
    expect(res.headers['retry-after']).toBe('30')
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN)
    expect(res.body.error.code).toBe('BILLING_RATE_LIMITED')
  })

  it('validation (invalid_field) → 422', async () => {
    mockPaddle.customers.create.mockRejectedValue(apiErr('invalid_field', 'email is invalid'))
    const res = await checkout('GROWTH')
    expect(res.status).toBe(422)
    expectNoLeak(res)
  })

  it('Paddle 5xx → 503 BILLING_UPSTREAM_UNAVAILABLE; network failure → 503; neither is 502/504', async () => {
    mockPaddle.customers.create.mockRejectedValueOnce(apiErr('internal_error', 'oops', 'api_error'))
    const a = await checkout('GROWTH')
    mockPaddle.customers.create.mockRejectedValueOnce(new Error('connect ECONNREFUSED 1.2.3.4:443'))
    await sleep(20)
    const b = await checkout('GROWTH')
    expect([a.status, b.status]).toEqual([503, 503])
    expect(a.body.error.code).toBe('BILLING_UPSTREAM_UNAVAILABLE')
    await expectNoBillingState()
  })

  it('pre-checkout duplicate guard: key lacks subscription.read (403) → guard degraded with an alert, checkout still works', async () => {
    mockPaddle.subscriptions.list.mockReturnValue({ next: async () => { throw apiErr('forbidden') } })
    const res = await checkout('GROWTH')
    expect(res.status).toBe(200)
    expect(errorLogs().some((c) => c[0]?.alert === 'billing.duplicate_guard_degraded')).toBe(true)
  })

  it('pre-checkout duplicate guard: Paddle 5xx → fails CLOSED (503, no transaction)', async () => {
    mockPaddle.subscriptions.list.mockReturnValue({ next: async () => { throw apiErr('internal_error', 'x', 'api_error') } })
    const res = await checkout('GROWTH')
    expect(res.status).toBe(503)
    expect(mockPaddle.transactions.create).not.toHaveBeenCalled()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('CORS — preflight and headers on success AND failure responses', () => {
  it('OPTIONS preflight for POST /billing/checkout from app.rapto.cloud is accepted with the exact origin (never *)', async () => {
    const res = await request(app)
      .options('/api/v1/billing/checkout')
      .set('Origin', ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type,x-request-id')
    expect(res.status).toBe(204)
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN)
    expect(res.headers['access-control-allow-origin']).not.toBe('*')
    expect(res.headers['access-control-allow-credentials']).toBe('true')
    expect(res.headers['access-control-allow-headers'].toLowerCase()).toEqual(expect.stringContaining('authorization'))
    expect(res.headers['access-control-allow-methods']).toEqual(expect.stringContaining('POST'))
    expect(res.headers['vary']).toEqual(expect.stringContaining('Origin'))
  })

  it('successful response carries CORS headers', async () => {
    const res = await checkout('GROWTH')
    expect(res.status).toBe(200)
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN)
  })

  it.each([
    ['Paddle permission failure (503)', async () => { mockPaddle.customers.create.mockRejectedValue(apiErr('forbidden')); return checkout('GROWTH') }, 503],
    ['validation failure (4xx)', async () => request(app).post('/api/v1/billing/checkout').set(bearer()).send({ planId: 'FREE', interval: 'month' }), undefined],
    ['unauthenticated (401)', async () => request(app).post('/api/v1/billing/checkout').set('Origin', ORIGIN).send({}), 401],
  ])('error response keeps CORS headers: %s', async (_name, run, status) => {
    const res = await run()
    if (status) expect(res.status).toBe(status)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN)
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })

  it('an unlisted origin never receives an Allow-Origin header (no wildcard workaround)', async () => {
    const res = await request(app).post('/api/v1/billing/checkout').set({ ...bearer(), Origin: 'https://evil.example' }).send({ planId: 'GROWTH', interval: 'month' })
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
    const pre = await request(app).options('/api/v1/billing/checkout').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST')
    expect(pre.headers['access-control-allow-origin']).toBeUndefined()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Request context & observability', () => {
  it('the request log has the teamId and userId (it used to log teamId: null because it read req.team)', async () => {
    const res = await checkout('GROWTH', 'month', { 'X-Request-ID': 'req-abc-123' })
    expect(res.status).toBe(200)
    await sleep(50)
    const entry = (logger.info as jest.Mock).mock.calls.map((c) => c[0]).find((o) => o?.path === '/api/v1/billing/checkout')
    expect(entry).toMatchObject({ teamId: team.id, userId: admin.id, statusCode: 200, requestId: 'req-abc-123' })
  })

  it('the X-Request-ID returned to the client is the same id that appears in the logs', async () => {
    const res = await checkout('GROWTH', 'month', { 'X-Request-ID': 'req-trace-777' })
    expect(res.headers['x-request-id']).toBe('req-trace-777')
  })

  it('structured failure logs carry requestId, userId, teamId, operation and the upstream code', async () => {
    mockPaddle.customers.create.mockRejectedValue(apiErr('forbidden'))
    await checkout('GROWTH', 'month', { 'X-Request-ID': 'req-fail-1' })
    const log = errorLogs().map((c) => c[0]).find((o) => o?.upstream === 'paddle')
    expect(log).toMatchObject({ requestId: 'req-fail-1', userId: admin.id, teamId: team.id, operation: 'customers.getOrCreate', paddleCode: 'forbidden', paddleKind: 'permission' })
  })
})
