/**
 * "Paid Growth trial, application still shows Free" — reproduction + regression suite.
 *
 * Production evidence: checkout succeeded, `/billing/sync` returned 200, the team stayed Free, and
 * `billing.duplicate_subscription` fired with ONE id (the new subscription).
 *
 * Hypothesis proven here: a team that already has an OLD (dead) subscription row cannot adopt the NEW live
 * Paddle subscription — reconcile lets the stored (dead) subscription win and then reports the new live one as a
 * "duplicate"; the webhook path refuses to replace a locally-"live" but actually-dead row.
 */
import '../support/billing-test-env'
import { PlanType, SubscriptionStatus } from '@prisma/client'
import { prisma, makeTeam, makeUser, resetBillingTables } from '../support/billing-db'
import { DAY, PRICES, envelope, subscription, transaction, uid } from '../support/paddle-fixtures'

jest.mock('../../src/config/redis', () => ({ redis: require('../support/fake-redis').createFakeRedis() }))
jest.mock('../../src/queues/queue.client', () => {
  const { assertBullMqAcceptsJobId } = require('../support/bullmq-validate')
  const add = jest.fn(async (_n: string, _d: any, o?: { jobId?: string }) => {
    if (o?.jobId) assertBullMqAcceptsJobId(o.jobId)
    return { id: o?.jobId }
  })
  return { notifyQueue: { add }, billingWebhookQueue: { add } }
})
jest.mock('../../src/realtime/socket.emitter', () => ({ socketEmitter: { to: () => ({ emit: jest.fn() }) } }))

const mockPaddle = {
  subscriptions: { get: jest.fn(), list: jest.fn(), cancel: jest.fn() },
  customers: { get: jest.fn(), create: jest.fn() },
  transactions: { create: jest.fn() },
}
jest.mock('../../src/services/paddle.client', () => ({ paddle: mockPaddle }))

import express from 'express'
import request from 'supertest'
import { billingRouter } from '../../src/modules/billing/billing.routes'
import { errorMiddleware } from '../../src/middleware/error.middleware'
import { generateAccessToken } from '../../src/modules/auth/auth.helpers'
import { logger } from '../../src/config/logger'
import { recordIncomingEvent } from '../../src/modules/webhooks/paddle.inbox.repository'
import { processInboxEvent } from '../../src/modules/webhooks/paddle.event-processor'
import { reconcileTeamFromPaddle } from '../../src/modules/billing/subscription-lifecycle.service'
import { getTeamEntitlement } from '../../src/modules/billing/entitlement.service'
import { PLAN_LIMITS } from '../../src/config/plans.config'
import { checkMeetingLimit } from '../../src/middleware/plan-limits.middleware'

jest.setTimeout(60_000)

const app = express()
app.use(express.json())
app.use('/api/v1/billing', billingRouter)
app.use(errorMiddleware)

const ago = (ms: number) => new Date(Date.now() - ms)
const ahead = (ms: number) => new Date(Date.now() + ms)
let team: any
let admin: any
const bearer = () => ({ Authorization: `Bearer ${generateAccessToken(admin)}` })
const getTeam = () => prisma.team.findUniqueOrThrow({ where: { id: team.id } })
const getSub = () => prisma.subscription.findUnique({ where: { teamId: team.id } })
const alerts = () => (logger.error as jest.Mock).mock.calls.map((c) => c[0]?.alert).filter(Boolean)

/** The NEW Growth trial exactly as Paddle reports it. */
const growthTrial = (id: string, over: Record<string, any> = {}) => ({
  ...subscription({
    id, status: 'trialing', customerId: team.paddleCustomerId, teamId: team.id, priceId: PRICES.GROWTH_M,
    periodStart: ago(60_000), periodEnd: ahead(14 * DAY), trialStart: ago(60_000), trialEnd: ahead(14 * DAY),
  }),
  custom_data: { teamId: team.id, planId: 'GROWTH', interval: 'month' },
  items: [{
    price: { id: PRICES.GROWTH_M, unit_price: { amount: '9900', currency_code: 'USD' }, trial_period: { interval: 'day', frequency: 14 } },
    trial_dates: { starts_at: ago(60_000).toISOString(), ends_at: ahead(14 * DAY).toISOString() },
    quantity: 1,
  }],
  ...over,
})

/** A previous subscription row in our DB (e.g. an earlier trial). */
async function seedOldSubscription(id: string, status: SubscriptionStatus, plan: PlanType = PlanType.STARTER) {
  await prisma.subscription.create({
    data: {
      teamId: team.id, paddleSubscriptionId: id, paddleCustomerId: team.paddleCustomerId, plan, billingInterval: 'month',
      status, currentPeriodStart: ago(40 * DAY), currentPeriodEnd: ago(26 * DAY), trialStart: ago(40 * DAY), trialEnd: ago(26 * DAY),
      cancelledAt: status === SubscriptionStatus.cancelled ? ago(26 * DAY) : null, unitAmount: 4900,
    },
  })
  await prisma.team.update({ where: { id: team.id }, data: { plan: status === SubscriptionStatus.cancelled ? 'FREE' : plan } })
}

beforeAll(async () => {
  await resetBillingTables()
})
beforeEach(async () => {
  jest.clearAllMocks()
  jest.spyOn(logger, 'error')
  jest.spyOn(logger, 'warn')
  await resetBillingTables()
  team = await makeTeam({ plan: 'FREE' })
  admin = await makeUser(team.id, 'ADMIN')
  mockPaddle.subscriptions.list.mockReturnValue({ next: async () => [] })
})
afterAll(async () => {
  await prisma.$disconnect()
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Root cause: a dead stored subscription blocks adoption of the new live one', () => {
  it('REPRO — stored subscription is cancelled in Paddle, a new Growth trial is live: reconcile must ADOPT the new one (it used to report a "duplicate" and stay Free)', async () => {
    const oldId = uid('sub')
    const newId = uid('sub')
    await seedOldSubscription(oldId, SubscriptionStatus.cancelled)
    mockPaddle.subscriptions.get.mockResolvedValue(subscription({ id: oldId, status: 'canceled', customerId: team.paddleCustomerId, teamId: team.id, periodEnd: null }))
    mockPaddle.subscriptions.list.mockReturnValue({ next: async () => [growthTrial(newId)] })

    const r = await reconcileTeamFromPaddle(team.id)

    expect(alerts()).not.toContain('billing.duplicate_subscription') // the "duplicate" was simply the new subscription
    expect(r).toMatchObject({ synced: true, plan: PlanType.GROWTH, status: SubscriptionStatus.trialing, subscriptionId: newId })
    const sub = await getSub()
    expect(sub).toMatchObject({ paddleSubscriptionId: newId, status: SubscriptionStatus.trialing, plan: PlanType.GROWTH, billingInterval: 'month' })
    expect(sub!.trialEnd!.getTime()).toBeGreaterThan(Date.now() + 13 * DAY)
    expect((await getTeam()).plan).toBe(PlanType.GROWTH)
    expect((await getTeamEntitlement(team.id)).plan).toBe(PlanType.GROWTH)
    // the previous subscription is preserved in the audit history, not deleted
    expect(await prisma.billingAuditLog.count({ where: { teamId: team.id, action: 'SUBSCRIPTION_REPLACED' } })).toBe(1)
  })

  it('REPRO — repeating the sync keeps the new subscription (idempotent; no flip-flop, no alert)', async () => {
    const oldId = uid('sub')
    const newId = uid('sub')
    await seedOldSubscription(oldId, SubscriptionStatus.cancelled)
    mockPaddle.subscriptions.get.mockImplementation(async (id: string) =>
      id === oldId ? subscription({ id: oldId, status: 'canceled', customerId: team.paddleCustomerId, teamId: team.id, periodEnd: null }) : growthTrial(newId))
    mockPaddle.subscriptions.list.mockReturnValue({ next: async () => [growthTrial(newId)] })

    await reconcileTeamFromPaddle(team.id)
    await reconcileTeamFromPaddle(team.id)
    const r3 = await reconcileTeamFromPaddle(team.id)
    expect(r3).toMatchObject({ synced: true, plan: PlanType.GROWTH, subscriptionId: newId })
    expect(alerts()).not.toContain('billing.duplicate_subscription')
    expect(await prisma.subscription.count({ where: { teamId: team.id } })).toBe(1)
  })

  it('REPRO — stored row is locally LIVE but stale (Paddle says cancelled): the webhook for the new subscription must not be dropped as a "mismatch"', async () => {
    const oldId = uid('sub')
    const newId = uid('sub')
    await prisma.subscription.create({
      data: { teamId: team.id, paddleSubscriptionId: oldId, paddleCustomerId: team.paddleCustomerId, plan: PlanType.STARTER, billingInterval: 'month', status: SubscriptionStatus.active, currentPeriodStart: ago(40 * DAY), currentPeriodEnd: ahead(5 * DAY), unitAmount: 4900 },
    })
    await prisma.team.update({ where: { id: team.id }, data: { plan: 'STARTER' } })
    // Paddle truth: old one is cancelled, new one is a live Growth trial
    mockPaddle.subscriptions.get.mockImplementation(async (id: string) =>
      id === oldId ? subscription({ id: oldId, status: 'canceled', customerId: team.paddleCustomerId, teamId: team.id, periodEnd: null }) : growthTrial(newId))
    mockPaddle.subscriptions.list.mockReturnValue({ next: async () => [growthTrial(newId)] })

    const body = envelope('subscription.created', growthTrial(newId))
    await recordIncomingEvent({ eventId: body.event_id, eventType: body.event_type, occurredAt: new Date(body.occurred_at), payload: body })
    const out = await processInboxEvent(body.event_id)

    expect(out.status).toBe('PROCESSED')
    expect(await getSub()).toMatchObject({ paddleSubscriptionId: newId, status: SubscriptionStatus.trialing, plan: PlanType.GROWTH })
    expect((await getTeam()).plan).toBe(PlanType.GROWTH)
  })

  it('a GENUINE second live subscription is still flagged and never overwrites the tracked live one', async () => {
    const trackedId = uid('sub')
    const otherId = uid('sub')
    await prisma.subscription.create({
      data: { teamId: team.id, paddleSubscriptionId: trackedId, paddleCustomerId: team.paddleCustomerId, plan: PlanType.STARTER, billingInterval: 'month', status: SubscriptionStatus.active, currentPeriodStart: ago(DAY), currentPeriodEnd: ahead(29 * DAY), unitAmount: 4900 },
    })
    await prisma.team.update({ where: { id: team.id }, data: { plan: 'STARTER' } })
    const tracked = subscription({ id: trackedId, status: 'active', customerId: team.paddleCustomerId, teamId: team.id, periodStart: ago(DAY), periodEnd: ahead(29 * DAY) })
    mockPaddle.subscriptions.get.mockResolvedValue(tracked)
    mockPaddle.subscriptions.list.mockReturnValue({ next: async () => [tracked, growthTrial(otherId)] })

    const r = await reconcileTeamFromPaddle(team.id)
    expect(alerts()).toContain('billing.duplicate_subscription')
    const dup = (logger.error as jest.Mock).mock.calls.map((c) => c[0]).find((o) => o?.alert === 'billing.duplicate_subscription')
    expect(dup.ids).toEqual([otherId]) // ids = the EXTRA live subscriptions only; the tracked one is never listed
    expect(r.anomalies.join()).toMatch(/additional_live_paddle_subscriptions/)
    expect((await getSub())?.paddleSubscriptionId).toBe(trackedId)
    expect((await getTeam()).plan).toBe(PlanType.STARTER)
    expect(mockPaddle.subscriptions.cancel).not.toHaveBeenCalled() // never cancels a customer's subscription
  })

  it('no stored subscription + exactly one live Paddle subscription ⇒ adopted, no alert', async () => {
    const newId = uid('sub')
    mockPaddle.subscriptions.list.mockReturnValue({ next: async () => [growthTrial(newId)] })
    const r = await reconcileTeamFromPaddle(team.id)
    expect(r).toMatchObject({ synced: true, subscriptionId: newId, plan: PlanType.GROWTH })
    expect(alerts()).not.toContain('billing.duplicate_subscription')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Honest sync endpoint — HTTP status and body reflect what actually happened', () => {
  const sync = () => request(app).post('/api/v1/billing/sync').set(bearer()).send({})

  it('adopts the new trial: 200, outcome=synced, plan GROWTH, status trialing, trial dates, subscription id', async () => {
    const oldId = uid('sub')
    const newId = uid('sub')
    await seedOldSubscription(oldId, SubscriptionStatus.cancelled)
    mockPaddle.subscriptions.get.mockResolvedValue(subscription({ id: oldId, status: 'canceled', customerId: team.paddleCustomerId, teamId: team.id, periodEnd: null }))
    mockPaddle.subscriptions.list.mockReturnValue({ next: async () => [growthTrial(newId)] })

    const res = await sync()
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ synced: true, outcome: 'synced', plan: 'GROWTH', status: 'trialing', subscriptionId: newId })
    expect(res.body.trialEnd).toBeTruthy()

    const sub = await request(app).get('/api/v1/billing/subscription').set(bearer())
    expect(sub.body.subscription).toMatchObject({ plan: 'GROWTH', status: 'trialing' })
    const usage = await request(app).get('/api/v1/billing/usage').set(bearer())
    expect(usage.body.meetingsLimit).toBe(PLAN_LIMITS.GROWTH.meetings)
    expect(usage.body.membersLimit).toBe(PLAN_LIMITS.GROWTH.members)
  })

  it('Paddle unreachable ⇒ 503 (NOT a misleading 200)', async () => {
    await seedOldSubscription(uid('sub'), SubscriptionStatus.cancelled)
    mockPaddle.subscriptions.get.mockRejectedValue(new Error('connect ETIMEDOUT'))
    const res = await sync()
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('BILLING_SYNC_UNAVAILABLE')
  })

  it('Paddle has no subscription for the customer ⇒ 200 outcome=no_subscription, synced=false (a truthful "nothing to sync")', async () => {
    const res = await sync()
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ synced: false, outcome: 'no_subscription', plan: 'FREE' })
  })

  it('a live Paddle subscription whose price is not configured ⇒ 409 outcome=unmappable with an alert, never a silent 200', async () => {
    mockPaddle.subscriptions.list.mockReturnValue({ next: async () => [growthTrial(uid('sub'), { items: [{ price: { id: 'pri_unknown', unit_price: { amount: '1', currency_code: 'USD' } } }], custom_data: null })] })
    const res = await sync()
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('BILLING_SYNC_UNRESOLVED')
    expect(alerts()).toContain('billing.reconcile_failed')
    expect((await getTeam()).plan).toBe(PlanType.FREE)
  })

  it('concurrent syncs (double-click, auto-sync + overlay callback) converge to ONE subscription row and one replacement audit', async () => {
    const oldId = uid('sub')
    const newId = uid('sub')
    await seedOldSubscription(oldId, SubscriptionStatus.cancelled)
    mockPaddle.subscriptions.get.mockImplementation(async (id: string) =>
      id === oldId ? subscription({ id: oldId, status: 'canceled', customerId: team.paddleCustomerId, teamId: team.id, periodEnd: null }) : growthTrial(newId))
    mockPaddle.subscriptions.list.mockReturnValue({ next: async () => [growthTrial(newId)] })

    const results = await Promise.all(Array.from({ length: 6 }, () => reconcileTeamFromPaddle(team.id)))
    expect(results.every((r) => r.plan === PlanType.GROWTH)).toBe(true)
    expect(await prisma.subscription.count({ where: { teamId: team.id } })).toBe(1)
    expect((await getSub())?.paddleSubscriptionId).toBe(newId)
    expect(await prisma.billingAuditLog.count({ where: { teamId: team.id, action: 'SUBSCRIPTION_REPLACED' } })).toBe(1)
    expect(alerts()).not.toContain('billing.duplicate_subscription')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Trialing Growth is a paid entitlement (not Free just because no payment was collected yet)', () => {
  it('trialing Growth ⇒ effective plan GROWTH and Growth limits are enforced by the quota middleware', async () => {
    const newId = uid('sub')
    mockPaddle.subscriptions.list.mockReturnValue({ next: async () => [growthTrial(newId)] })
    await reconcileTeamFromPaddle(team.id)
    expect((await getTeamEntitlement(team.id)).plan).toBe(PlanType.GROWTH)

    // 20 meetings used: over the Free limit (5), under Growth (120)
    await prisma.team.update({ where: { id: team.id }, data: { meetingsUsed: 20 } })
    const next = jest.fn()
    await checkMeetingLimit({ teamId: team.id } as any, {} as any, next)
    expect(next).toHaveBeenCalledWith() // allowed — no PlanLimitError
  })

  it('same team on Free would have been blocked at the same usage (proves the limit really switched)', async () => {
    await prisma.team.update({ where: { id: team.id }, data: { meetingsUsed: 20 } })
    const next = jest.fn()
    await checkMeetingLimit({ teamId: team.id } as any, {} as any, next)
    expect(next.mock.calls[0][0]).toBeTruthy() // PlanLimitError
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Webhook lifecycle for the same purchase', () => {
  const deliver = async (b: any) => {
    await recordIncomingEvent({ eventId: b.event_id, eventType: b.event_type, occurredAt: new Date(b.occurred_at), payload: b })
    return processInboxEvent(b.event_id)
  }

  it('Free → Growth: transaction.completed ($0 trial) → subscription.created → subscription.activated, any delivery order', async () => {
    const subId = uid('sub')
    const t0 = Date.now()
    const txn = envelope('transaction.completed', transaction({ id: uid('txn'), subscriptionId: subId, customerId: team.paddleCustomerId, teamId: team.id, total: '0', priceId: PRICES.GROWTH_M, periodStart: ago(1000), periodEnd: ahead(14 * DAY), trial: true }), { occurredAt: new Date(t0 + 2000) })
    const created = envelope('subscription.created', growthTrial(subId), { occurredAt: new Date(t0) })
    const activated = envelope('subscription.trialing', growthTrial(subId), { occurredAt: new Date(t0 + 1000) })

    for (const e of [txn, activated, created, created /* duplicate delivery */]) await deliver(e)

    const sub = await getSub()
    expect(sub).toMatchObject({ paddleSubscriptionId: subId, plan: PlanType.GROWTH, status: SubscriptionStatus.trialing })
    expect((await getTeam()).plan).toBe(PlanType.GROWTH)
    expect(await prisma.subscription.count({ where: { teamId: team.id } })).toBe(1)
  })

  it('trial → active (first payment) keeps Growth and updates status', async () => {
    const subId = uid('sub')
    await deliver(envelope('subscription.created', growthTrial(subId), { occurredAt: ago(15 * DAY) }))
    await deliver(envelope('subscription.updated', subscription({ id: subId, status: 'active', customerId: team.paddleCustomerId, teamId: team.id, priceId: PRICES.GROWTH_M, periodStart: ago(1000), periodEnd: ahead(30 * DAY) }), { occurredAt: new Date() }))
    expect(await getSub()).toMatchObject({ status: SubscriptionStatus.active, plan: PlanType.GROWTH })
    expect((await getTeam()).plan).toBe(PlanType.GROWTH)
  })

  it('cancellation after the purchase returns the team to Free', async () => {
    const subId = uid('sub')
    await deliver(envelope('subscription.created', growthTrial(subId), { occurredAt: ago(DAY) }))
    await deliver(envelope('subscription.canceled', subscription({ id: subId, status: 'canceled', customerId: team.paddleCustomerId, teamId: team.id, priceId: PRICES.GROWTH_M, periodEnd: null }), { occurredAt: new Date() }))
    expect((await getTeam()).plan).toBe(PlanType.FREE)
    expect((await getSub())?.status).toBe(SubscriptionStatus.cancelled)
  })

  it('existing customer buying ANOTHER plan after the first ended: the new subscription replaces the dead one and history is kept', async () => {
    const first = uid('sub')
    const second = uid('sub')
    await deliver(envelope('subscription.created', subscription({ id: first, status: 'active', customerId: team.paddleCustomerId, teamId: team.id, periodStart: ago(40 * DAY), periodEnd: ahead(30 * DAY) }), { occurredAt: ago(40 * DAY) }))
    await deliver(envelope('subscription.canceled', subscription({ id: first, status: 'canceled', customerId: team.paddleCustomerId, teamId: team.id, periodEnd: null }), { occurredAt: ago(30 * DAY) }))
    await deliver(envelope('subscription.created', growthTrial(second), { occurredAt: ago(1000) }))
    expect(await getSub()).toMatchObject({ paddleSubscriptionId: second, plan: PlanType.GROWTH })
    const replaced = await prisma.billingAuditLog.findFirst({ where: { teamId: team.id, action: 'SUBSCRIPTION_REPLACED' } })
    expect((replaced!.payload as any).previous.paddleSubscriptionId).toBe(first)
  })

  it('failed database persistence: the event stays retryable (FAILED, not lost) and no partial state is written', async () => {
    const subId = uid('sub')
    const body = envelope('subscription.created', growthTrial(subId))
    const billingRepo = require('../../src/modules/billing/billing.repository')
    const spy = jest.spyOn(billingRepo, 'applySubscriptionState').mockRejectedValueOnce(new Error('connection terminated unexpectedly'))
    await expect(deliver(body)).rejects.toThrow('connection terminated')
    spy.mockRestore()
    expect(await getSub()).toBeNull()
    expect((await getTeam()).plan).toBe(PlanType.FREE)
    expect((await prisma.paddleWebhookEvent.findUniqueOrThrow({ where: { eventId: body.event_id } })).status).toBe('FAILED')
    await processInboxEvent(body.event_id)
    expect(await getSub()).toMatchObject({ paddleSubscriptionId: subId, status: SubscriptionStatus.trialing })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Cache invalidation happens AFTER persistence, and repeats are harmless', () => {
  it('invalidatePlanCache is only called once the subscription row is committed; calling it repeatedly is idempotent', async () => {
    const { redis } = require('../../src/config/redis')
    const newId = uid('sub')
    mockPaddle.subscriptions.list.mockReturnValue({ next: async () => [growthTrial(newId)] })
    await redis.set(`cache:team:plan:${team.id}`, JSON.stringify({ plan: 'FREE', meetingsUsed: 0, membersCount: 1 }))
    await redis.set(`cache:team:detail:${team.id}`, JSON.stringify({ plan: 'FREE' }))

    const seenAtInvalidation: Array<string | undefined> = []
    const del = jest.spyOn(redis as any, 'del').mockImplementation((async (...keys: string[]) => {
      seenAtInvalidation.push((await prisma.subscription.findUnique({ where: { teamId: team.id } }))?.paddleSubscriptionId)
      for (const k of keys) redis._store.delete(k)
      return keys.length
    }) as any)
    await reconcileTeamFromPaddle(team.id)
    await reconcileTeamFromPaddle(team.id)
    del.mockRestore()

    expect(seenAtInvalidation.length).toBeGreaterThanOrEqual(1)
    expect(seenAtInvalidation.every((id) => id === newId)).toBe(true) // never invalidated before the DB write was visible
    expect(await redis.get(`cache:team:plan:${team.id}`)).toBeNull()
    expect((await getTeamEntitlement(team.id)).plan).toBe(PlanType.GROWTH)
  })
})
