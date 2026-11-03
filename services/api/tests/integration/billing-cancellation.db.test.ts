/**
 * Cancellation lifecycle — Paddle Customer Portal → webhook → DB → entitlement → cache → API.
 *
 * Payload shapes follow Paddle's documented behaviour (developer.paddle.com, read this session):
 *  • Portal cancel = a SCHEDULED change: status stays "active", scheduled_change {action:"cancel", effective_at == period end,
 *    resume_at:null}, next_billed_at:null, canceled_at:null, current_billing_period unchanged; event = subscription.updated.
 *  • At effective_at: status "canceled", canceled_at set, current_billing_period null, next_billed_at null; events = subscription.updated
 *    (status canceled) then subscription.canceled.
 *  • Immediate cancel: the same canceled payload at once (past_due / paused subscriptions cancel immediately).
 * REAL: Postgres, handlers, inbox, repository, entitlement, sweeper, routes/auth. FAKED: Paddle SDK object only.
 */
import '../support/billing-test-env'
import express from 'express'
import request from 'supertest'
import { PlanType, SubscriptionStatus } from '@prisma/client'
import { prisma, makeTeam, makeUser, resetBillingTables } from '../support/billing-db'
import { DAY, PRICES, envelope, uid } from '../support/paddle-fixtures'

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

import { billingRouter } from '../../src/modules/billing/billing.routes'
import { errorMiddleware } from '../../src/middleware/error.middleware'
import { generateAccessToken } from '../../src/modules/auth/auth.helpers'
import { recordIncomingEvent } from '../../src/modules/webhooks/paddle.inbox.repository'
import { processInboxEvent } from '../../src/modules/webhooks/paddle.event-processor'
import { runEntitlementSync } from '../../src/modules/billing/subscription-lifecycle.service'
import { getTeamEntitlement } from '../../src/modules/billing/entitlement.service'
import { checkMeetingLimit } from '../../src/middleware/plan-limits.middleware'
import { notifyQueue } from '../../src/queues/queue.client'
import * as billingRepo from '../../src/modules/billing/billing.repository'

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

/** A Growth subscription exactly as Paddle reports it. */
function growth(id: string, o: {
  status: 'active' | 'trialing' | 'canceled' | 'past_due'
  periodStart?: Date; periodEnd?: Date
  scheduledCancelAt?: Date | null
  canceledAt?: Date
  trialEnd?: Date
}) {
  const canceled = o.status === 'canceled'
  const start = o.periodStart ?? ago(10 * DAY)
  const end = o.periodEnd ?? ahead(20 * DAY)
  return {
    id,
    status: o.status,
    customer_id: team.paddleCustomerId,
    currency_code: 'USD',
    started_at: start.toISOString(),
    first_billed_at: start.toISOString(),
    // docs: scheduled cancel ⇒ next_billed_at null; canceled ⇒ next_billed_at null and current_billing_period null
    next_billed_at: canceled || o.scheduledCancelAt ? null : end.toISOString(),
    canceled_at: canceled ? (o.canceledAt ?? new Date()).toISOString() : null,
    current_billing_period: canceled ? null : { starts_at: start.toISOString(), ends_at: end.toISOString() },
    scheduled_change: o.scheduledCancelAt ? { action: 'cancel', effective_at: o.scheduledCancelAt.toISOString(), resume_at: null } : null,
    billing_cycle: { interval: 'month', frequency: 1 },
    custom_data: { teamId: team.id, planId: 'GROWTH', interval: 'month' },
    items: [{
      price: { id: PRICES.GROWTH_M, unit_price: { amount: '9900', currency_code: 'USD' }, trial_period: o.status === 'trialing' ? { interval: 'day', frequency: 14 } : null },
      trial_dates: o.status === 'trialing' ? { starts_at: start.toISOString(), ends_at: (o.trialEnd ?? end).toISOString() } : null,
      quantity: 1,
    }],
  }
}

async function deliver(type: string, data: any, at: Date = new Date(), eventId?: string) {
  const b = envelope(type, data, { occurredAt: at, eventId })
  await recordIncomingEvent({ eventId: b.event_id, eventType: b.event_type, occurredAt: at, payload: b })
  return { body: b, result: await processInboxEvent(b.event_id) }
}

/** Active Growth subscription for the team (via the normal webhook path). */
async function activeGrowth(subId: string, periodEnd = ahead(20 * DAY)) {
  await deliver('subscription.created', growth(subId, { status: 'active', periodStart: ago(10 * DAY), periodEnd }), ago(10 * DAY))
}

beforeAll(async () => {
  await resetBillingTables()
})
beforeEach(async () => {
  jest.clearAllMocks()
  await resetBillingTables()
  team = await makeTeam({ plan: 'FREE' })
  admin = await makeUser(team.id, 'ADMIN')
  mockPaddle.subscriptions.list.mockReturnValue({ next: async () => [] })
})
afterAll(async () => {
  await prisma.$disconnect()
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Scenario A — scheduled cancellation (customer cancels in the Paddle Customer Portal)', () => {
  it('subscription.updated with scheduled_change=cancel: status stays active, cancellation recorded with its effective date, Growth access continues', async () => {
    const subId = uid('sub')
    const end = ahead(20 * DAY)
    await activeGrowth(subId, end)

    const { result } = await deliver('subscription.updated', growth(subId, { status: 'active', periodEnd: end, scheduledCancelAt: end }))
    expect(result.status).toBe('PROCESSED')

    const sub = await getSub()
    expect(sub).toMatchObject({ status: SubscriptionStatus.active, plan: PlanType.GROWTH, cancelAtPeriodEnd: true })
    expect(sub!.cancelledAt).toBeNull() // nothing has been cancelled yet
    expect(sub!.currentPeriodEnd!.getTime()).toBe(end.getTime()) // the effective date (== scheduled_change.effective_at)
    expect((await getTeam()).plan).toBe(PlanType.GROWTH) // NOT downgraded early
    expect((await getTeamEntitlement(team.id))).toMatchObject({ plan: PlanType.GROWTH, reason: 'cancel_scheduled' })
  })

  it('the API exposes plan + cancellation scheduled + effective date for the billing UI', async () => {
    const subId = uid('sub')
    const end = ahead(20 * DAY)
    await activeGrowth(subId, end)
    await deliver('subscription.updated', growth(subId, { status: 'active', periodEnd: end, scheduledCancelAt: end }))

    const res = await request(app).get('/api/v1/billing/subscription').set(bearer())
    expect(res.body.subscription).toMatchObject({ plan: 'GROWTH', status: 'active', cancelAtPeriodEnd: true })
    expect(new Date(res.body.subscription.currentPeriodEnd).getTime()).toBe(end.getTime())
  })

  it('documented invariant violated (effective_at != period end): still processed, access bounded by the period end, and an alert makes it visible', async () => {
    const { logger } = require('../../src/config/logger')
    const warn = jest.spyOn(logger, 'warn')
    const subId = uid('sub')
    const periodEnd = ahead(20 * DAY)
    await activeGrowth(subId, periodEnd)
    await deliver('subscription.updated', growth(subId, { status: 'active', periodEnd, scheduledCancelAt: ahead(5 * DAY) }))
    expect(await getSub()).toMatchObject({ cancelAtPeriodEnd: true })
    expect(warn.mock.calls.some((c: any[]) => c[0]?.alert === 'billing.cancel_effective_date_mismatch')).toBe(true)
    warn.mockRestore()
  })

  it('customer un-cancels in the portal (scheduled_change removed): subscription.updated clears the flag, still Growth', async () => {
    const subId = uid('sub')
    const end = ahead(20 * DAY)
    await activeGrowth(subId, end)
    await deliver('subscription.updated', growth(subId, { status: 'active', periodEnd: end, scheduledCancelAt: end }), ago(2000))
    await deliver('subscription.updated', growth(subId, { status: 'active', periodEnd: end }), ago(1000))
    expect(await getSub()).toMatchObject({ cancelAtPeriodEnd: false, status: SubscriptionStatus.active })
    expect((await getTeam()).plan).toBe(PlanType.GROWTH)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Scenario D — the cancellation takes effect', () => {
  it('effective date reached WITHOUT any webhook: read-time entitlement is Free at the exact boundary, Growth one ms earlier', async () => {
    const subId = uid('sub')
    const end = ahead(20 * DAY)
    await activeGrowth(subId, end)
    await deliver('subscription.updated', growth(subId, { status: 'active', periodEnd: end, scheduledCancelAt: end }))
    expect((await getTeamEntitlement(team.id, new Date(end.getTime() - 1))).plan).toBe(PlanType.GROWTH)
    expect((await getTeamEntitlement(team.id, end)).plan).toBe(PlanType.FREE)
  })

  it('the sweeper persists the transition (status cancelled, cancelledAt = the EFFECTIVE date, plan Free) even if the webhook never arrives', async () => {
    const subId = uid('sub')
    const end = ago(60_000) // effective date was a minute ago
    await prisma.subscription.create({
      data: { teamId: team.id, paddleSubscriptionId: subId, paddleCustomerId: team.paddleCustomerId, plan: PlanType.GROWTH, billingInterval: 'month', status: SubscriptionStatus.active, cancelAtPeriodEnd: true, currentPeriodStart: ago(31 * DAY), currentPeriodEnd: end, unitAmount: 9900 },
    })
    await prisma.team.update({ where: { id: team.id }, data: { plan: 'GROWTH' } })

    const summary = await runEntitlementSync()
    expect(summary.cancellationsEnded).toBeGreaterThanOrEqual(1)
    const sub = await getSub()
    expect(sub!.status).toBe(SubscriptionStatus.cancelled)
    expect(sub!.cancelAtPeriodEnd).toBe(false)
    expect(sub!.cancelledAt!.getTime()).toBe(end.getTime()) // effective date, not "whenever the cron ran"
    expect((await getTeam()).plan).toBe(PlanType.FREE)
  })

  it('Paddle subscription.canceled (the real effective-date event: status canceled, canceled_at, NO billing period) → cancelled, Free, timestamps persisted', async () => {
    const subId = uid('sub')
    const end = ahead(20 * DAY)
    await activeGrowth(subId, end)
    await deliver('subscription.updated', growth(subId, { status: 'active', periodEnd: end, scheduledCancelAt: end }), ago(5000))
    const canceledAt = ago(1000)

    const { result } = await deliver('subscription.canceled', growth(subId, { status: 'canceled', canceledAt }), new Date())
    expect(result.status).toBe('PROCESSED')
    const sub = await getSub()
    expect(sub).toMatchObject({ status: SubscriptionStatus.cancelled, cancelAtPeriodEnd: false, plan: PlanType.GROWTH })
    expect(sub!.cancelledAt!.getTime()).toBe(canceledAt.getTime())
    expect(sub!.currentPeriodEnd).not.toBeNull() // history of the last paid period is kept
    expect((await getTeam()).plan).toBe(PlanType.FREE)
    expect((await getTeam()).billingCycleEnd).toBeNull()
    expect((notifyQueue.add as jest.Mock).mock.calls.some((c) => c[1].type === 'SUBSCRIPTION_CANCELLED')).toBe(true)
  })

  it('Paddle sends subscription.updated(status canceled) BEFORE subscription.canceled: both converge to the same cancelled state', async () => {
    const subId = uid('sub')
    await activeGrowth(subId)
    const t = Date.now()
    await deliver('subscription.updated', growth(subId, { status: 'canceled', canceledAt: new Date(t) }), new Date(t))
    await deliver('subscription.canceled', growth(subId, { status: 'canceled', canceledAt: new Date(t) }), new Date(t + 10))
    expect(await getSub()).toMatchObject({ status: SubscriptionStatus.cancelled })
    expect((await getTeam()).plan).toBe(PlanType.FREE)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Scenario B — immediate cancellation (e.g. past_due / paused, or API effective_from=immediately)', () => {
  it('canceled payload mid-period → Free immediately, cancelledAt = canceled_at', async () => {
    const subId = uid('sub')
    await activeGrowth(subId, ahead(20 * DAY))
    const canceledAt = new Date()
    await deliver('subscription.canceled', growth(subId, { status: 'canceled', canceledAt }))
    expect(await getSub()).toMatchObject({ status: SubscriptionStatus.cancelled })
    expect((await getSub())!.cancelledAt!.getTime()).toBe(canceledAt.getTime())
    expect((await getTeam()).plan).toBe(PlanType.FREE)
    const sub = await request(app).get('/api/v1/billing/subscription').set(bearer())
    expect(sub.body.subscription).toBeNull() // Free: nothing to show
  })

  it('a canceled event is trusted even if a (stale) future billing period is attached — Paddle says access ended', async () => {
    const subId = uid('sub')
    await activeGrowth(subId)
    const payload = growth(subId, { status: 'canceled', canceledAt: new Date() })
    ;(payload as any).current_billing_period = { starts_at: ago(DAY).toISOString(), ends_at: ahead(10 * DAY).toISOString() }
    await deliver('subscription.canceled', payload)
    expect((await getTeam()).plan).toBe(PlanType.FREE) // docs: canceled = access ended
    expect((await getSub())!.status).toBe(SubscriptionStatus.cancelled)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Scenario C — cancelling during the trial', () => {
  it('scheduled cancel during a trial keeps Growth until the trial ends, records the cancellation, then Free', async () => {
    const subId = uid('sub')
    const trialEnd = ahead(10 * DAY)
    await deliver('subscription.created', growth(subId, { status: 'trialing', periodStart: ago(4 * DAY), periodEnd: trialEnd, trialEnd }), ago(4 * DAY))
    await deliver('subscription.updated', growth(subId, { status: 'trialing', periodStart: ago(4 * DAY), periodEnd: trialEnd, trialEnd, scheduledCancelAt: trialEnd }))

    expect(await getSub()).toMatchObject({ status: SubscriptionStatus.trialing, cancelAtPeriodEnd: true })
    expect((await getTeam()).plan).toBe(PlanType.GROWTH)
    expect((await getTeamEntitlement(team.id, new Date(trialEnd.getTime() - 1))).plan).toBe(PlanType.GROWTH)
    expect((await getTeamEntitlement(team.id, trialEnd)).plan).toBe(PlanType.FREE)

    await deliver('subscription.canceled', growth(subId, { status: 'canceled', canceledAt: trialEnd }), new Date(Date.now() + 1000))
    expect(await getSub()).toMatchObject({ status: SubscriptionStatus.cancelled })
    expect((await getTeam()).plan).toBe(PlanType.FREE)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Idempotency, ordering and failure', () => {
  it('duplicate cancellation webhook: one audit row, one email, one state change', async () => {
    const subId = uid('sub')
    await activeGrowth(subId)
    const evt = envelope('subscription.canceled', growth(subId, { status: 'canceled' }), { occurredAt: new Date() })
    await recordIncomingEvent({ eventId: evt.event_id, eventType: evt.event_type, occurredAt: new Date(evt.occurred_at), payload: evt })
    const a = await processInboxEvent(evt.event_id)
    const b = await processInboxEvent(evt.event_id) // Paddle redelivery
    expect([a.skipped, b.skipped]).toEqual([false, true])
    expect(await prisma.billingAuditLog.count({ where: { eventId: evt.event_id } })).toBe(1)
    expect((notifyQueue.add as jest.Mock).mock.calls.filter((c) => c[1].type === 'SUBSCRIPTION_CANCELLED')).toHaveLength(1)
  })

  it('older subscription.updated(active, scheduled) arriving AFTER subscription.canceled cannot resurrect the subscription', async () => {
    const subId = uid('sub')
    await activeGrowth(subId)
    const t = Date.now()
    await deliver('subscription.canceled', growth(subId, { status: 'canceled', canceledAt: new Date(t) }), new Date(t))
    const stale = await deliver('subscription.updated', growth(subId, { status: 'active', scheduledCancelAt: ahead(DAY) }), new Date(t - 60_000))
    expect(stale.result.status).toBe('PROCESSED')
    expect(await getSub()).toMatchObject({ status: SubscriptionStatus.cancelled, cancelAtPeriodEnd: false })
    expect((await getTeam()).plan).toBe(PlanType.FREE)
  })

  it('database failure while processing the cancellation: event stays FAILED/retryable, NO partial state, retry completes it', async () => {
    const subId = uid('sub')
    await activeGrowth(subId)
    const evt = envelope('subscription.canceled', growth(subId, { status: 'canceled' }), { occurredAt: new Date() })
    await recordIncomingEvent({ eventId: evt.event_id, eventType: evt.event_type, occurredAt: new Date(evt.occurred_at), payload: evt })
    const spy = jest.spyOn(billingRepo, 'applySubscriptionState').mockRejectedValueOnce(new Error('connection terminated unexpectedly'))
    await expect(processInboxEvent(evt.event_id)).rejects.toThrow('connection terminated')
    spy.mockRestore()

    expect((await getTeam()).plan).toBe(PlanType.GROWTH) // untouched
    expect((await getSub())!.status).toBe(SubscriptionStatus.active)
    expect((await prisma.paddleWebhookEvent.findUniqueOrThrow({ where: { eventId: evt.event_id } })).status).toBe('FAILED')

    await processInboxEvent(evt.event_id)
    expect((await getTeam()).plan).toBe(PlanType.FREE)
  })

  it('an old subscription cancel cannot override a NEWER legitimate subscription', async () => {
    const oldId = uid('sub')
    const newId = uid('sub')
    await activeGrowth(oldId)
    await deliver('subscription.canceled', growth(oldId, { status: 'canceled' }), ago(5 * DAY))
    await activeGrowth(newId)
    expect((await getSub())!.paddleSubscriptionId).toBe(newId)

    const live = growth(newId, { status: 'active' })
    mockPaddle.subscriptions.get.mockResolvedValue(live)
    mockPaddle.subscriptions.list.mockReturnValue({ next: async () => [live] })
    const late = await deliver('subscription.canceled', growth(oldId, { status: 'canceled' }), ago(1000))
    expect(late.result.status).toBe('PROCESSED')
    expect(await getSub()).toMatchObject({ paddleSubscriptionId: newId, status: SubscriptionStatus.active })
    expect((await getTeam()).plan).toBe(PlanType.GROWTH)
  })

  it("another team's subscription is unaffected by this team's cancellation", async () => {
    const other = await makeTeam({ plan: 'FREE' })
    const otherSub = uid('sub')
    const subId = uid('sub')
    await activeGrowth(subId)
    const o = growth(otherSub, { status: 'active' })
    ;(o as any).customer_id = other.paddleCustomerId
    ;(o as any).custom_data = { teamId: other.id, planId: 'GROWTH', interval: 'month' }
    await deliver('subscription.created', o, ago(DAY))

    await deliver('subscription.canceled', growth(subId, { status: 'canceled' }))
    expect((await getTeam()).plan).toBe(PlanType.FREE)
    expect((await prisma.team.findUniqueOrThrow({ where: { id: other.id } })).plan).toBe(PlanType.GROWTH)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Cache, manual sync and re-purchase', () => {
  it('cancellation effective: a cached Growth plan is invalidated only after the DB commit, and the quota gate immediately uses Free', async () => {
    const { redis } = require('../../src/config/redis')
    const subId = uid('sub')
    await activeGrowth(subId)
    await prisma.team.update({ where: { id: team.id }, data: { meetingsUsed: 20 } })
    await redis.set(`cache:team:plan:${team.id}`, JSON.stringify({ plan: 'GROWTH', meetingsUsed: 20, membersCount: 1 }))

    const seen: string[] = []
    const del = jest.spyOn(redis as any, 'del').mockImplementation((async (...keys: string[]) => {
      seen.push((await prisma.subscription.findUnique({ where: { teamId: team.id } }))!.status)
      for (const k of keys) redis._store.delete(k)
      return keys.length
    }) as any)
    await deliver('subscription.canceled', growth(subId, { status: 'canceled' }))
    del.mockRestore()

    expect(seen.length).toBeGreaterThanOrEqual(1)
    expect(seen.every((s) => s === SubscriptionStatus.cancelled)).toBe(true) // never invalidated before the commit
    const next = jest.fn()
    await checkMeetingLimit({ teamId: team.id } as any, {} as any, next)
    expect(next.mock.calls[0][0]).toBeTruthy() // 20 meetings > Free limit 5 ⇒ PlanLimitError
  })

  it('manual sync picks up a portal cancellation that no webhook delivered (scheduled)', async () => {
    const subId = uid('sub')
    const end = ahead(20 * DAY)
    await activeGrowth(subId, end)
    mockPaddle.subscriptions.get.mockResolvedValue(growth(subId, { status: 'active', periodEnd: end, scheduledCancelAt: end }))
    mockPaddle.subscriptions.list.mockReturnValue({ next: async () => [growth(subId, { status: 'active', periodEnd: end, scheduledCancelAt: end })] })

    const res = await request(app).post('/api/v1/billing/sync').set(bearer()).send({})
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ synced: true, outcome: 'synced', plan: 'GROWTH', status: 'active' })
    expect(await getSub()).toMatchObject({ cancelAtPeriodEnd: true })
    const sub = await request(app).get('/api/v1/billing/subscription').set(bearer())
    expect(sub.body.subscription.cancelAtPeriodEnd).toBe(true)
  })

  it('manual sync picks up an already-effective cancellation (Paddle: canceled) → Free', async () => {
    const subId = uid('sub')
    await activeGrowth(subId)
    mockPaddle.subscriptions.get.mockResolvedValue(growth(subId, { status: 'canceled', canceledAt: ago(60_000) }))
    const res = await request(app).post('/api/v1/billing/sync').set(bearer()).send({})
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ synced: true, plan: 'FREE' })
    expect((await getSub())!.status).toBe(SubscriptionStatus.cancelled)
    expect((await getTeam()).plan).toBe(PlanType.FREE)
  })

  it('manual sync does not touch an active subscription that Paddle still reports as plain active', async () => {
    const subId = uid('sub')
    const end = ahead(20 * DAY)
    await activeGrowth(subId, end)
    const live = growth(subId, { status: 'active', periodEnd: end })
    mockPaddle.subscriptions.get.mockResolvedValue(live)
    mockPaddle.subscriptions.list.mockReturnValue({ next: async () => [live] })
    const res = await request(app).post('/api/v1/billing/sync').set(bearer()).send({})
    expect(res.body).toMatchObject({ synced: true, plan: 'GROWTH', status: 'active' })
    expect(await getSub()).toMatchObject({ cancelAtPeriodEnd: false, status: SubscriptionStatus.active })
  })

  it('customer purchases Growth again after cancellation: new subscription replaces the cancelled one, history kept, Growth restored', async () => {
    const first = uid('sub')
    const second = uid('sub')
    await activeGrowth(first)
    await deliver('subscription.canceled', growth(first, { status: 'canceled' }), ago(DAY))
    expect((await getTeam()).plan).toBe(PlanType.FREE)

    await deliver('subscription.created', growth(second, { status: 'trialing', periodStart: ago(1000), periodEnd: ahead(14 * DAY), trialEnd: ahead(14 * DAY) }), new Date())
    expect(await getSub()).toMatchObject({ paddleSubscriptionId: second, status: SubscriptionStatus.trialing, cancelAtPeriodEnd: false, cancelledAt: null })
    expect((await getTeam()).plan).toBe(PlanType.GROWTH)
    const hist = await prisma.billingAuditLog.findFirst({ where: { teamId: team.id, action: 'SUBSCRIPTION_REPLACED' } })
    expect((hist!.payload as any).previous.paddleSubscriptionId).toBe(first)
  })
})
