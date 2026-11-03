/**
 * Billing HTTP API against real auth middleware (real JWTs), real role/tenant checks and a real Postgres.
 * Paddle SDK and Redis are stubbed. Covers authorization, IDOR, price tampering, duplicate checkout,
 * in-place plan change contract, fail-closed duplicate-subscription guard and rate limiting.
 */
import '../support/billing-test-env'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { PlanType, SubscriptionStatus } from '@prisma/client'
import { prisma, makeTeam, makeUser, resetBillingTables, sleep } from '../support/billing-db'
import { DAY, subscription, uid } from '../support/paddle-fixtures'

jest.mock('../../src/config/redis', () => ({ redis: require('../support/fake-redis').createFakeRedis() }))
jest.mock('../../src/queues/queue.client', () => ({ notifyQueue: { add: jest.fn() }, billingWebhookQueue: { add: jest.fn() } }))
jest.mock('../../src/realtime/socket.emitter', () => ({ socketEmitter: { to: () => ({ emit: jest.fn() }) } }))

const paddleMock = {
  subscriptions: { list: jest.fn(), get: jest.fn(), cancel: jest.fn() },
  transactions: { getInvoicePDF: jest.fn() },
}
const clientMock = {
  paddle: paddleMock,
  getOrCreatePaddleCustomer: jest.fn(),
  createTransaction: jest.fn(),
  updateSubscriptionPlan: jest.fn(),
  createCustomerPortalSession: jest.fn(),
}
jest.mock('../../src/services/paddle.client', () => clientMock)

import { billingRouter } from '../../src/modules/billing/billing.routes'
import { errorMiddleware } from '../../src/middleware/error.middleware'
import { generateAccessToken } from '../../src/modules/auth/auth.helpers'
import { env } from '../../src/config/env'
import { runEntitlementSync } from '../../src/modules/billing/subscription-lifecycle.service'

jest.setTimeout(60_000)

const app = express()
app.use(express.json())
app.use('/api/v1/billing', billingRouter)
app.use(errorMiddleware)

const token = (u: { id: string; teamId: string | null; role: string; email: string }) => generateAccessToken(u as any)
const bearer = (u: any) => ({ Authorization: `Bearer ${token(u)}` })
const ago = (ms: number) => new Date(Date.now() - ms)
const ahead = (ms: number) => new Date(Date.now() + ms)

let A: { team: any; admin: any; member: any }
let B: { team: any; admin: any }

async function giveActiveSub(teamId: string, customerId: string, over: Partial<{ status: SubscriptionStatus; plan: PlanType; interval: string; cancelAtPeriodEnd: boolean }> = {}) {
  const subId = uid('sub')
  await prisma.subscription.create({
    data: {
      teamId, paddleSubscriptionId: subId, paddleCustomerId: customerId, plan: over.plan ?? PlanType.STARTER,
      billingInterval: over.interval ?? 'month', status: over.status ?? SubscriptionStatus.active,
      currentPeriodStart: ago(DAY), currentPeriodEnd: ahead(29 * DAY), cancelAtPeriodEnd: over.cancelAtPeriodEnd ?? false, unitAmount: 4900,
    },
  })
  await prisma.team.update({ where: { id: teamId }, data: { plan: over.plan ?? PlanType.STARTER, gracePeriodEnd: over.status === SubscriptionStatus.past_due ? ahead(3 * DAY) : null } })
  return subId
}

beforeAll(async () => {
  await resetBillingTables()
})

beforeEach(async () => {
  jest.clearAllMocks()
  await resetBillingTables()
  const ta = await makeTeam({ plan: 'FREE' })
  const tb = await makeTeam({ plan: 'FREE' })
  A = { team: ta, admin: await makeUser(ta.id, 'ADMIN'), member: await makeUser(ta.id, 'MEMBER') }
  B = { team: tb, admin: await makeUser(tb.id, 'ADMIN') }
  paddleMock.subscriptions.list.mockReturnValue({ next: async () => [] })
  clientMock.getOrCreatePaddleCustomer.mockResolvedValue('ctm_checkout')
  clientMock.createTransaction.mockResolvedValue({ transactionId: 'txn_new', checkoutUrl: 'https://checkout.example/txn_new' })
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Authentication & authorization', () => {
  const protectedRoutes: Array<['get' | 'post', string]> = [
    ['get', '/subscription'], ['get', '/usage'], ['get', '/invoices'], ['get', '/invoices/abc/pdf'],
    ['post', '/checkout'], ['post', '/portal'], ['post', '/cancel'], ['post', '/sync'], ['get', '/webhook-status'],
  ]

  it.each(protectedRoutes)('%s %s without a token → 401', async (method, path) => {
    const res = await (request(app) as any)[method](`/api/v1/billing${path}`).send({})
    expect(res.status).toBe(401)
  })

  it('a token signed with the wrong secret is rejected', async () => {
    const forged = jwt.sign({ sub: A.admin.id, teamId: A.team.id, role: 'ADMIN', email: A.admin.email }, 'attacker-secret', { algorithm: 'HS256', issuer: 'rapto.cloud', audience: 'rapto-api' })
    const res = await request(app).get('/api/v1/billing/subscription').set('Authorization', `Bearer ${forged}`)
    expect(res.status).toBe(401)
  })

  it.each([
    ['post', '/checkout', { planId: 'STARTER', interval: 'month' }],
    ['post', '/portal', {}],
    ['post', '/cancel', {}],
    ['post', '/sync', {}],
    ['get', '/invoices', undefined],
  ] as const)('MEMBER cannot %s %s → 403 (ADMIN-only)', async (method, path, body) => {
    const res = await (request(app) as any)[method](`/api/v1/billing${path}`).set(bearer(A.member)).send(body ?? {})
    expect(res.status).toBe(403)
    expect(clientMock.createTransaction).not.toHaveBeenCalled()
    expect(paddleMock.subscriptions.cancel).not.toHaveBeenCalled()
  })

  it('MEMBER may read subscription/usage of their own team', async () => {
    expect((await request(app).get('/api/v1/billing/subscription').set(bearer(A.member))).status).toBe(200)
    expect((await request(app).get('/api/v1/billing/usage').set(bearer(A.member))).status).toBe(200)
  })

  it('a user without a team is rejected', async () => {
    const loner = await makeUser(null, 'ADMIN')
    expect((await request(app).get('/api/v1/billing/subscription').set(bearer(loner))).status).toBe(403)
  })

  it('stale/forged teamId claim: token says team A but the user actually belongs to team B → 403', async () => {
    const t = token({ id: B.admin.id, teamId: A.team.id, role: 'ADMIN', email: B.admin.email })
    const res = await request(app).post('/api/v1/billing/cancel').set('Authorization', `Bearer ${t}`).send({})
    expect(res.status).toBe(403)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Cross-tenant isolation (IDOR)', () => {
  it("admin of team B cannot read team A's subscription or invoices, nor fetch A's invoice PDF by id", async () => {
    await giveActiveSub(A.team.id, A.team.paddleCustomerId)
    const inv = await prisma.invoice.create({ data: { teamId: A.team.id, paddleTransactionId: uid('txn'), paddleCustomerId: A.team.paddleCustomerId, amountDue: 4900, amountPaid: 4900, status: 'paid' } })

    const sub = await request(app).get('/api/v1/billing/subscription').set(bearer(B.admin))
    expect(sub.body.subscription).toBeNull()

    const list = await request(app).get('/api/v1/billing/invoices').set(bearer(B.admin))
    expect(list.status).toBe(200)
    expect(list.body.invoices).toHaveLength(0)

    const pdf = await request(app).get(`/api/v1/billing/invoices/${inv.id}/pdf`).set(bearer(B.admin)).set('Accept', 'application/json')
    expect(pdf.status).toBe(404)
    expect(paddleMock.transactions.getInvoicePDF).not.toHaveBeenCalled()

    const own = await request(app).get('/api/v1/billing/invoices').set(bearer(A.admin))
    expect(own.body.invoices).toHaveLength(1)
  })

  it("admin of team B cancelling cannot touch team A's subscription (team comes from the token, never the body)", async () => {
    const subA = await giveActiveSub(A.team.id, A.team.paddleCustomerId)
    const res = await request(app).post('/api/v1/billing/cancel').set(bearer(B.admin)).send({ teamId: A.team.id, subscriptionId: subA })
    expect(res.status).toBe(400) // B has no subscription to cancel
    expect(paddleMock.subscriptions.cancel).not.toHaveBeenCalled()
    expect((await prisma.subscription.findUniqueOrThrow({ where: { teamId: A.team.id } })).cancelAtPeriodEnd).toBe(false)
  })

  it('webhook-status shows only the caller’s own workspace events', async () => {
    await prisma.paddleWebhookEvent.createMany({ data: [
      { eventId: uid('evt'), eventType: 'x', status: 'NEEDS_ATTENTION', teamId: A.team.id, payload: {} },
      { eventId: uid('evt'), eventType: 'x', status: 'NEEDS_ATTENTION', teamId: B.team.id, payload: {} },
    ] })
    const res = await request(app).get('/api/v1/billing/webhook-status').set(bearer(A.admin))
    expect(res.status).toBe(200)
    expect(res.body.workspaceEventsNeedingAttention.every((e: any) => e.teamId === A.team.id)).toBe(true)
    expect(JSON.stringify(res.body)).not.toMatch(/pdl_|secret/i)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Checkout — price integrity, duplicates and failures', () => {
  it('frontend price manipulation is ignored: price & team are resolved server-side', async () => {
    const res = await request(app).post('/api/v1/billing/checkout').set(bearer(A.admin))
      .send({ planId: 'STARTER', interval: 'month', priceId: 'pri_attacker_free', amount: 1, currency: 'USD', teamId: B.team.id })
    expect(res.status).toBe(200)
    expect(clientMock.createTransaction).toHaveBeenCalledTimes(1)
    expect(clientMock.createTransaction.mock.calls[0][0]).toMatchObject({ priceId: 'pri_starter_m', teamId: A.team.id, planId: 'STARTER', interval: 'month' })
  })

  it.each([
    [{ planId: 'FREE', interval: 'month' }],
    [{ planId: 'ENTERPRISE', interval: 'month' }],
    [{ planId: 'PLATINUM', interval: 'month' }],
    [{ planId: 'STARTER', interval: 'week' }],
    [{ interval: 'month' }],
    [{}],
  ])('invalid body %j → rejected before any Paddle call', async (body) => {
    const res = await request(app).post('/api/v1/billing/checkout').set(bearer(A.admin)).send(body)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    expect(clientMock.createTransaction).not.toHaveBeenCalled()
  })

  it('duplicate checkout (double click / two tabs) → exactly one transaction; the other gets 409', async () => {
    clientMock.createTransaction.mockImplementation(async () => { await sleep(300); return { transactionId: 'txn_slow', checkoutUrl: 'https://x/y' } })
    const [r1, r2, r3] = await Promise.all([1, 2, 3].map(() => request(app).post('/api/v1/billing/checkout').set(bearer(A.admin)).send({ planId: 'GROWTH', interval: 'year' })))
    const statuses = [r1.status, r2.status, r3.status].sort()
    expect(statuses).toEqual([200, 409, 409])
    expect(clientMock.createTransaction).toHaveBeenCalledTimes(1)
  })

  it('failed checkout: Paddle error → 503 (never 502/504 — edge proxies replace those and strip CORS headers) with a sanitized message', async () => {
    clientMock.createTransaction.mockRejectedValue(Object.assign(new Error('Paddle Error: api_key pdl_sdbx_SECRET invalid at https://sandbox-api.paddle.com/transactions'), { code: 'forbidden' }))
    const res = await request(app).post('/api/v1/billing/checkout').set(bearer(A.admin)).send({ planId: 'STARTER', interval: 'month' })
    expect(res.status).toBe(503)
    expect(JSON.stringify(res.body)).not.toMatch(/pdl_|sandbox-api|api_key/i)
  })

  it('same plan already active → 409', async () => {
    await giveActiveSub(A.team.id, A.team.paddleCustomerId)
    const res = await request(app).post('/api/v1/billing/checkout').set(bearer(A.admin)).send({ planId: 'STARTER', interval: 'month' })
    expect(res.status).toBe(409)
    expect(clientMock.createTransaction).not.toHaveBeenCalled()
  })

  it('past_due / paused subscriptions cannot start a SECOND parallel subscription → 409, no transaction', async () => {
    await giveActiveSub(A.team.id, A.team.paddleCustomerId, { status: SubscriptionStatus.past_due })
    const res = await request(app).post('/api/v1/billing/checkout').set(bearer(A.admin)).send({ planId: 'GROWTH', interval: 'month' })
    expect(res.status).toBe(409)
    expect(res.body.error?.code ?? res.body.code).toMatch(/SUBSCRIPTION_NEEDS_ATTENTION/)
    expect(clientMock.createTransaction).not.toHaveBeenCalled()
    expect(clientMock.updateSubscriptionPlan).not.toHaveBeenCalled()
  })

  it('Paddle already bills this customer but the DB does not know (lost webhooks): checkout refused (409) and the DB is healed', async () => {
    const liveId = uid('sub')
    const live = subscription({ id: liveId, status: 'active', customerId: 'ctm_checkout', teamId: A.team.id, periodStart: ago(DAY), periodEnd: ahead(29 * DAY) })
    paddleMock.subscriptions.list.mockReturnValue({ next: async () => [live] })
    paddleMock.subscriptions.get.mockResolvedValue(live)

    const res = await request(app).post('/api/v1/billing/checkout').set(bearer(A.admin)).send({ planId: 'STARTER', interval: 'month' })
    expect(res.status).toBe(409)
    expect(clientMock.createTransaction).not.toHaveBeenCalled()
    expect((await prisma.subscription.findUnique({ where: { teamId: A.team.id } }))?.paddleSubscriptionId).toBe(liveId)
    expect((await prisma.team.findUniqueOrThrow({ where: { id: A.team.id } })).plan).toBe(PlanType.STARTER)
  })

  it('fails CLOSED when Paddle cannot be queried: 503, no transaction (a duplicate charge is worse than a retry)', async () => {
    paddleMock.subscriptions.list.mockReturnValue({ next: async () => { throw new Error('ETIMEDOUT') } })
    const res = await request(app).post('/api/v1/billing/checkout').set(bearer(A.admin)).send({ planId: 'STARTER', interval: 'month' })
    expect(res.status).toBe(503)
    expect(clientMock.createTransaction).not.toHaveBeenCalled()
  })

  it('plan change is applied in place and returns the {updated:true} contract the frontend expects', async () => {
    const subId = await giveActiveSub(A.team.id, A.team.paddleCustomerId)
    clientMock.updateSubscriptionPlan.mockResolvedValue(
      subscription({ id: subId, status: 'active', customerId: A.team.paddleCustomerId, teamId: A.team.id, priceId: 'pri_growth_m', periodStart: ago(DAY), periodEnd: ahead(29 * DAY) })
    )
    const res = await request(app).post('/api/v1/billing/checkout').set(bearer(A.admin)).send({ planId: 'GROWTH', interval: 'month' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ updated: true, plan: 'GROWTH', checkoutUrl: null, transactionId: subId })
    expect(clientMock.updateSubscriptionPlan.mock.calls[0][0]).toMatchObject({ teamId: A.team.id, priceId: 'pri_growth_m' })
    expect((await prisma.team.findUniqueOrThrow({ where: { id: A.team.id } })).plan).toBe(PlanType.GROWTH)
  })

  it('a Paddle failure on plan change leaves local state untouched', async () => {
    await giveActiveSub(A.team.id, A.team.paddleCustomerId)
    clientMock.updateSubscriptionPlan.mockRejectedValue(new Error('boom'))
    const res = await request(app).post('/api/v1/billing/checkout').set(bearer(A.admin)).send({ planId: 'GROWTH', interval: 'month' })
    expect(res.status).toBe(503)
    expect((await prisma.team.findUniqueOrThrow({ where: { id: A.team.id } })).plan).toBe(PlanType.STARTER)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Cancel, sync and rate limiting', () => {
  it('cancel is idempotent: the second call does not hit Paddle again', async () => {
    await giveActiveSub(A.team.id, A.team.paddleCustomerId)
    paddleMock.subscriptions.cancel.mockResolvedValue({})
    const r1 = await request(app).post('/api/v1/billing/cancel').set(bearer(A.admin)).send({})
    const r2 = await request(app).post('/api/v1/billing/cancel').set(bearer(A.admin)).send({})
    expect([r1.status, r2.status]).toEqual([200, 200])
    expect(paddleMock.subscriptions.cancel).toHaveBeenCalledTimes(1)
    expect((await prisma.subscription.findUniqueOrThrow({ where: { teamId: A.team.id } })).cancelAtPeriodEnd).toBe(true)
  })

  it('Paddle cancel success + local write failure still reports success (Paddle is the source of truth)', async () => {
    await giveActiveSub(A.team.id, A.team.paddleCustomerId)
    paddleMock.subscriptions.cancel.mockResolvedValue({})
    const spy = jest.spyOn(prisma.subscription, 'update').mockRejectedValueOnce(new Error('db blip'))
    const res = await request(app).post('/api/v1/billing/cancel').set(bearer(A.admin)).send({})
    spy.mockRestore()
    expect(res.status).toBe(200)
  })

  it('a repeated /sync cannot be used to reset the meeting quota', async () => {
    const subId = await giveActiveSub(A.team.id, A.team.paddleCustomerId)
    const periodStart = (await prisma.subscription.findUniqueOrThrow({ where: { teamId: A.team.id } })).currentPeriodStart!
    await prisma.team.update({ where: { id: A.team.id }, data: { meetingsUsed: 33, billingCycleStart: periodStart } })
    paddleMock.subscriptions.get.mockResolvedValue(
      subscription({ id: subId, status: 'active', customerId: A.team.paddleCustomerId, teamId: A.team.id, periodStart, periodEnd: ahead(29 * DAY) })
    )
    for (let i = 0; i < 4; i++) {
      const r = await request(app).post('/api/v1/billing/sync').set(bearer(A.admin)).send({})
      expect(r.status).toBe(200)
    }
    expect((await prisma.team.findUniqueOrThrow({ where: { id: A.team.id } })).meetingsUsed).toBe(33)
  })

  it('billing mutations are rate limited per workspace (429 after 10/min)', async () => {
    paddleMock.subscriptions.get.mockResolvedValue({})
    const codes: number[] = []
    for (let i = 0; i < 12; i++) codes.push((await request(app).post('/api/v1/billing/sync').set(bearer(A.admin)).send({})).status)
    expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(2)
    // other workspaces are unaffected
    expect((await request(app).post('/api/v1/billing/sync').set(bearer(B.admin)).send({})).status).toBe(200)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Expired trial — what the logged-in user sees', () => {
  async function trialingTeamWhoseTrialEndsIn(ms: number) {
    const t = await makeTeam({ plan: 'STARTER' })
    const u = await makeUser(t.id, 'ADMIN')
    await prisma.subscription.create({
      data: {
        teamId: t.id, paddleSubscriptionId: uid('sub'), paddleCustomerId: t.paddleCustomerId!, plan: PlanType.STARTER, billingInterval: 'month',
        status: SubscriptionStatus.trialing, trialStart: new Date(Date.now() + ms - 14 * DAY), trialEnd: new Date(Date.now() + ms),
        currentPeriodStart: new Date(Date.now() + ms - 14 * DAY), currentPeriodEnd: new Date(Date.now() + ms), unitAmount: 4900,
      },
    })
    return { t, u }
  }

  it('user stays logged in, refreshes after the boundary: billing screen shows Free (no paid plan), usage uses Free limits', async () => {
    const { u } = await trialingTeamWhoseTrialEndsIn(1500)
    const before = await request(app).get('/api/v1/billing/subscription').set(bearer(u))
    expect(before.body.subscription).toMatchObject({ plan: 'STARTER', status: 'trialing' })
    expect((await request(app).get('/api/v1/billing/usage').set(bearer(u))).body.meetingsLimit).toBe(40)

    await sleep(1700) // the 14-day boundary passes; NO cron, NO webhook, same JWT/session

    const after = await request(app).get('/api/v1/billing/subscription').set(bearer(u))
    expect(after.body.subscription).toBeNull()
    expect((await request(app).get('/api/v1/billing/usage').set(bearer(u))).body.meetingsLimit).toBe(5)
  })

  it('after expiry the user can upgrade normally (new checkout, not blocked as "already subscribed")', async () => {
    const { t, u } = await trialingTeamWhoseTrialEndsIn(-1000)
    await runEntitlementSync()
    expect((await prisma.team.findUniqueOrThrow({ where: { id: t.id } })).plan).toBe(PlanType.FREE)
    const res = await request(app).post('/api/v1/billing/checkout').set(bearer(u)).send({ planId: 'STARTER', interval: 'month' })
    expect(res.status).toBe(200)
    expect(res.body.transactionId).toBe('txn_new')
  })
})
