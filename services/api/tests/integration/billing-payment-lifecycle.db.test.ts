/**
 * Payment + subscription lifecycle against a REAL Postgres (throwaway container) with the REAL repository,
 * handlers, inbox processor and sweeper. Only the network edges are replaced: Paddle SDK, BullMQ/Redis, sockets.
 */
import '../support/billing-test-env'
import { PlanType, SubscriptionStatus } from '@prisma/client'
import { prisma, makeTeam, resetBillingTables } from '../support/billing-db'
import { DAY, PRICES, adjustment, envelope, subscription, transaction, uid } from '../support/paddle-fixtures'

jest.mock('../../src/config/redis', () => ({ redis: require('../support/fake-redis').createFakeRedis() }))
jest.mock('../../src/queues/queue.client', () => {
  const { assertBullMqAcceptsJobId } = require('../support/bullmq-validate')
  const add = (name: string) =>
    jest.fn(async (_n: string, _d: any, opts?: { jobId?: string }) => {
      if (opts?.jobId) assertBullMqAcceptsJobId(opts.jobId) // real BullMQ rule: would have caught the ':' outage
      return { id: opts?.jobId, queue: name }
    })
  return { notifyQueue: { add: add('notify') }, billingWebhookQueue: { add: add('billing-webhook') } }
})
jest.mock('../../src/realtime/socket.emitter', () => ({ socketEmitter: { to: () => ({ emit: jest.fn() }) } }))

const paddleMock = {
  subscriptions: { get: jest.fn(), list: jest.fn(), cancel: jest.fn() },
}
jest.mock('../../src/services/paddle.client', () => ({ paddle: paddleMock }))

import { notifyQueue } from '../../src/queues/queue.client'
import * as billingRepo from '../../src/modules/billing/billing.repository'
import { recordIncomingEvent } from '../../src/modules/webhooks/paddle.inbox.repository'
import { processInboxEvent } from '../../src/modules/webhooks/paddle.event-processor'
import { getTeamEntitlement } from '../../src/modules/billing/entitlement.service'
import { resolveEntitlement } from '../../src/modules/billing/entitlement'
import { runEntitlementSync, runReconciliation } from '../../src/modules/billing/subscription-lifecycle.service'

jest.setTimeout(60_000)

// ── helpers ───────────────────────────────────────────────────────────────────

async function deliver(body: any) {
  await recordIncomingEvent({
    eventId: body.event_id,
    eventType: body.event_type,
    occurredAt: new Date(body.occurred_at),
    payload: body,
  })
  return processInboxEvent(body.event_id)
}

const team = async (over: Parameters<typeof makeTeam>[0] = {}) => makeTeam({ plan: 'FREE', ...over })
const getTeam = (id: string) => prisma.team.findUniqueOrThrow({ where: { id } })
const getSub = (teamId: string) => prisma.subscription.findUnique({ where: { teamId } })
const ago = (ms: number) => new Date(Date.now() - ms)
const ahead = (ms: number) => new Date(Date.now() + ms)

/** subscription.created (trialing, 14 days) for a team */
async function startTrial(t: { id: string; paddleCustomerId: string | null }, subId: string, opts: { start?: Date; days?: number } = {}) {
  const start = opts.start ?? new Date()
  const end = new Date(start.getTime() + (opts.days ?? 14) * DAY)
  await deliver(
    envelope(
      'subscription.created',
      subscription({ id: subId, status: 'trialing', customerId: t.paddleCustomerId!, teamId: t.id, periodStart: start, periodEnd: end, trialStart: start, trialEnd: end }),
      { occurredAt: start }
    )
  )
  return { start, end }
}

async function activatePaid(t: { id: string; paddleCustomerId: string | null }, subId: string, txnId = uid('txn'), start = new Date()) {
  const end = new Date(start.getTime() + 30 * DAY)
  await deliver(envelope('subscription.created', subscription({ id: subId, status: 'active', customerId: t.paddleCustomerId!, teamId: t.id, periodStart: start, periodEnd: end }), { occurredAt: start }))
  await deliver(envelope('transaction.completed', transaction({ id: txnId, subscriptionId: subId, customerId: t.paddleCustomerId!, teamId: t.id, total: '4900', periodStart: start, periodEnd: end }), { occurredAt: new Date(start.getTime() + 1000) }))
  return { txnId, start, end }
}

beforeAll(async () => {
  await resetBillingTables()
})
beforeEach(() => {
  jest.clearAllMocks()
  paddleMock.subscriptions.list.mockReturnValue({ next: async () => [] })
})
afterAll(async () => {
  await prisma.$disconnect()
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Payment lifecycle', () => {
  it('payment confirmation: subscription.created + transaction.completed activate the plan, invoice and emails', async () => {
    const t = await team()
    const { txnId } = await activatePaid(t, uid('sub'))

    const team2 = await getTeam(t.id)
    expect(team2.plan).toBe(PlanType.STARTER)
    expect(team2.gracePeriodEnd).toBeNull()
    expect((await getSub(t.id))?.status).toBe(SubscriptionStatus.active)
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { paddleTransactionId: txnId } })
    expect(inv).toMatchObject({ amountPaid: 4900, status: 'paid', teamId: t.id })
    expect((notifyQueue.add as jest.Mock).mock.calls.some((c) => c[1].type === 'BILLING_CONFIRMATION')).toBe(true)
  })

  it('transaction.paid and transaction.billed are ignored (billed is not a paid state)', async () => {
    const t = await team()
    const subId = uid('sub')
    const txn = transaction({ id: uid('txn'), subscriptionId: subId, customerId: t.paddleCustomerId!, teamId: t.id, total: '4900', periodStart: new Date(), periodEnd: ahead(30 * DAY) })
    expect((await deliver(envelope('transaction.billed', txn))).status).toBe('IGNORED')
    expect((await deliver(envelope('transaction.paid', txn))).status).toBe('IGNORED')
    expect(await getSub(t.id)).toBeNull()
    expect((await getTeam(t.id)).plan).toBe(PlanType.FREE)
  })

  it('duplicate webhook delivery: same event twice → one invoice, one audit row, one email, state unchanged', async () => {
    const t = await team()
    const subId = uid('sub')
    const start = new Date()
    const end = ahead(30 * DAY)
    await deliver(envelope('subscription.created', subscription({ id: subId, status: 'active', customerId: t.paddleCustomerId!, teamId: t.id, periodStart: start, periodEnd: end })))
    const txnBody = envelope('transaction.completed', transaction({ id: uid('txn'), subscriptionId: subId, customerId: t.paddleCustomerId!, teamId: t.id, total: '4900', periodStart: start, periodEnd: end }))

    const first = await deliver(txnBody)
    const second = await deliver(txnBody) // Paddle at-least-once redelivery
    expect(first.skipped).toBe(false)
    expect(second.skipped).toBe(true)

    expect(await prisma.invoice.count({ where: { teamId: t.id } })).toBe(1)
    expect(await prisma.billingAuditLog.count({ where: { eventId: txnBody.event_id } })).toBe(1)
    expect(await prisma.paddleWebhookEvent.count({ where: { eventId: txnBody.event_id } })).toBe(1)
    const confirmations = (notifyQueue.add as jest.Mock).mock.calls.filter((c) => c[1].type === 'BILLING_CONFIRMATION')
    expect(confirmations).toHaveLength(1)
  })

  it('concurrent processing of the SAME event: exactly one worker wins the claim', async () => {
    const t = await team()
    const body = envelope('subscription.created', subscription({ id: uid('sub'), status: 'active', customerId: t.paddleCustomerId!, teamId: t.id, periodStart: new Date(), periodEnd: ahead(30 * DAY) }))
    await recordIncomingEvent({ eventId: body.event_id, eventType: body.event_type, occurredAt: new Date(body.occurred_at), payload: body })

    const results = await Promise.all(Array.from({ length: 8 }, () => processInboxEvent(body.event_id)))
    expect(results.filter((r) => !r.skipped)).toHaveLength(1)
    expect(await prisma.billingAuditLog.count({ where: { eventId: body.event_id } })).toBe(1)
    expect((await getTeam(t.id)).plan).toBe(PlanType.STARTER)
  })

  it('concurrent DIFFERENT events for one team serialize and converge (no lost update / deadlock)', async () => {
    const t = await team()
    const subId = uid('sub')
    const start = new Date()
    const end = ahead(30 * DAY)
    const t0 = Date.now()
    const events = [
      envelope('subscription.created', subscription({ id: subId, status: 'active', customerId: t.paddleCustomerId!, teamId: t.id, periodStart: start, periodEnd: end }), { occurredAt: new Date(t0) }),
      envelope('subscription.updated', subscription({ id: subId, status: 'active', customerId: t.paddleCustomerId!, teamId: t.id, periodStart: start, periodEnd: end, priceId: PRICES.GROWTH_M }), { occurredAt: new Date(t0 + 1000) }),
      envelope('subscription.updated', subscription({ id: subId, status: 'active', customerId: t.paddleCustomerId!, teamId: t.id, periodStart: start, periodEnd: end, priceId: PRICES.BUSINESS_M }), { occurredAt: new Date(t0 + 2000) }),
    ]
    await Promise.all(events.map((e) => recordIncomingEvent({ eventId: e.event_id, eventType: e.event_type, occurredAt: new Date(e.occurred_at), payload: e })))
    await Promise.all(events.map((e) => processInboxEvent(e.event_id).catch(() => undefined)))
    // A processing attempt may lose the race for `created` vs `updated`; redo (idempotent) like the redrive would.
    for (const e of events) await processInboxEvent(e.event_id).catch(() => undefined)

    const final = await getSub(t.id)
    expect(final?.paddleSubscriptionId).toBe(subId)
    expect(final?.plan).toBe(PlanType.BUSINESS) // newest occurred_at wins regardless of execution order
    expect((await getTeam(t.id)).plan).toBe(PlanType.BUSINESS)
  })

  it('out-of-order: an older subscription.updated(active) arriving after subscription.canceled does NOT resurrect access', async () => {
    const t = await team()
    const subId = uid('sub')
    const t0 = Date.now()
    const start = new Date(t0)
    const end = ahead(30 * DAY)
    await deliver(envelope('subscription.created', subscription({ id: subId, status: 'active', customerId: t.paddleCustomerId!, teamId: t.id, periodStart: start, periodEnd: end }), { occurredAt: new Date(t0) }))
    await deliver(envelope('subscription.canceled', subscription({ id: subId, status: 'canceled', customerId: t.paddleCustomerId!, teamId: t.id, periodStart: start, periodEnd: null }), { occurredAt: new Date(t0 + 5000) }))
    expect((await getTeam(t.id)).plan).toBe(PlanType.FREE)

    const stale = await deliver(envelope('subscription.updated', subscription({ id: subId, status: 'active', customerId: t.paddleCustomerId!, teamId: t.id, periodStart: start, periodEnd: end }), { occurredAt: new Date(t0 + 2000) }))
    expect(stale.status).toBe('PROCESSED')
    expect((await getSub(t.id))?.status).toBe(SubscriptionStatus.cancelled)
    expect((await getTeam(t.id)).plan).toBe(PlanType.FREE)
  })

  it('a stale cancel for an OLD subscription cannot downgrade the NEW live subscription', async () => {
    const t = await team()
    const oldSub = uid('sub')
    const newSub = uid('sub')
    await activatePaid(t, oldSub)
    await deliver(envelope('subscription.canceled', subscription({ id: oldSub, status: 'canceled', customerId: t.paddleCustomerId!, teamId: t.id, periodEnd: null })))
    await activatePaid(t, newSub) // re-subscribed
    expect((await getTeam(t.id)).plan).toBe(PlanType.STARTER)

    // Paddle truth: the NEW subscription is live. The late cancel belongs to the superseded one.
    const live = subscription({ id: newSub, status: 'active', customerId: t.paddleCustomerId!, teamId: t.id, periodStart: new Date(), periodEnd: ahead(30 * DAY) })
    paddleMock.subscriptions.get.mockResolvedValue(live)
    paddleMock.subscriptions.list.mockReturnValue({ next: async () => [live] })
    const late = await deliver(envelope('subscription.canceled', subscription({ id: oldSub, status: 'canceled', customerId: t.paddleCustomerId!, teamId: t.id, periodEnd: null }), { occurredAt: ago(1000) }))
    expect(late.status).toBe('PROCESSED') // a superseded subscription's event is not an operator problem
    expect((await getSub(t.id))?.paddleSubscriptionId).toBe(newSub)
    expect((await getTeam(t.id)).plan).toBe(PlanType.STARTER)
  })

  it('duplicate subscription prevention: a second LIVE Paddle subscription never overwrites the tracked one (flagged for review)', async () => {
    const t = await team()
    const first = uid('sub')
    const second = uid('sub')
    await activatePaid(t, first)

    // Paddle truth: BOTH are live — a genuine duplicate.
    const liveFirst = subscription({ id: first, status: 'active', customerId: t.paddleCustomerId!, teamId: t.id, periodStart: new Date(), periodEnd: ahead(30 * DAY) })
    const liveSecond = subscription({ id: second, status: 'active', customerId: t.paddleCustomerId!, teamId: t.id, periodStart: new Date(), periodEnd: ahead(30 * DAY), priceId: PRICES.BUSINESS_M })
    paddleMock.subscriptions.get.mockResolvedValue(liveFirst)
    paddleMock.subscriptions.list.mockReturnValue({ next: async () => [liveFirst, liveSecond] })

    const r = await deliver(envelope('subscription.created', liveSecond))
    expect(r.status).toBe('NEEDS_ATTENTION')
    expect((await getSub(t.id))?.paddleSubscriptionId).toBe(first)
    expect((await getSub(t.id))?.plan).toBe(PlanType.STARTER)
    const row = await prisma.paddleWebhookEvent.findFirstOrThrow({ where: { teamId: t.id, status: 'NEEDS_ATTENTION' } })
    expect(row.lastError).toMatch(/different live Paddle subscription/)
  })

  it('duplicate transaction prevention: unique paddleTransactionId across teams and replays', async () => {
    const t = await team()
    const { txnId } = await activatePaid(t, uid('sub'))
    await expect(
      prisma.invoice.create({ data: { teamId: t.id, paddleTransactionId: txnId, paddleCustomerId: 'x', amountDue: 1, status: 'paid' } })
    ).rejects.toMatchObject({ code: 'P2002' })
  })

  it('customer mapping consistency: a Paddle customer shared by two teams is NOT guessed — flagged, no state change', async () => {
    const shared = `ctm_${uid('shared')}`
    const a = await team({ paddleCustomerId: shared })
    const b = await team({ paddleCustomerId: shared })
    const r = await deliver(envelope('subscription.created', { ...subscription({ id: uid('sub'), status: 'active', customerId: shared, periodStart: new Date(), periodEnd: ahead(30 * DAY) }), custom_data: null }))
    expect(r.status).toBe('NEEDS_ATTENTION')
    expect(await getSub(a.id)).toBeNull()
    expect(await getSub(b.id)).toBeNull()
  })

  it('unresolvable events are never silently dropped: stored as NEEDS_ATTENTION with the reason', async () => {
    const t = await team()
    const body = envelope('subscription.created', subscription({ id: uid('sub'), status: 'active', customerId: t.paddleCustomerId!, teamId: t.id, priceId: PRICES.UNKNOWN, periodStart: new Date(), periodEnd: ahead(DAY) }))
    body.data.custom_data = null // neither price nor custom_data resolve
    const r = await deliver(body)
    expect(r.status).toBe('NEEDS_ATTENTION')
    const row = await prisma.paddleWebhookEvent.findUniqueOrThrow({ where: { eventId: body.event_id } })
    expect(row.status).toBe('NEEDS_ATTENTION')
    expect(row.lastError).toMatch(/Cannot resolve plan/)
    expect((await getTeam(t.id)).plan).toBe(PlanType.FREE) // and the customer was NOT silently downgraded/upgraded
  })

  it('transient failure: handler error → FAILED + retryable; redelivery then succeeds (no lost event)', async () => {
    const t = await team()
    const subId = uid('sub')
    const body = envelope('subscription.created', subscription({ id: subId, status: 'active', customerId: t.paddleCustomerId!, teamId: t.id, periodStart: new Date(), periodEnd: ahead(DAY) }))
    const spy = jest.spyOn(billingRepo, 'applySubscriptionState').mockRejectedValueOnce(new Error('connection terminated'))
    await expect(deliver(body)).rejects.toThrow('connection terminated')
    const failed = await prisma.paddleWebhookEvent.findUniqueOrThrow({ where: { eventId: body.event_id } })
    expect(failed).toMatchObject({ status: 'FAILED', attempts: 1 })
    spy.mockRestore()

    const retry = await processInboxEvent(body.event_id) // what BullMQ / the redrive sweeper does
    expect(retry.skipped).toBe(false)
    expect((await prisma.paddleWebhookEvent.findUniqueOrThrow({ where: { eventId: body.event_id } })).status).toBe('PROCESSED')
    expect((await getTeam(t.id)).plan).toBe(PlanType.STARTER)
  })

  it('transaction rollback: a failure mid-write leaves NO partial subscription/plan change', async () => {
    const t = await team()
    await expect(
      billingRepo.applySubscriptionState({
        teamId: t.id,
        source: 'sync',
        data: {
          paddleSubscriptionId: uid('sub'), paddleCustomerId: 'ctm', plan: PlanType.STARTER, billingInterval: 'month',
          status: SubscriptionStatus.active, currentPeriodStart: new Date(), currentPeriodEnd: ahead(30 * DAY),
        },
        // amountDue missing ⇒ Prisma rejects the invoice upsert AFTER the subscription/team writes were issued
        invoice: { paddleTransactionId: uid('txn'), paddleCustomerId: 'ctm', amountPaid: 4900, currency: 'usd', status: 'paid' } as any,
      })
    ).rejects.toBeTruthy()
    expect(await getSub(t.id)).toBeNull()
    expect((await getTeam(t.id)).plan).toBe(PlanType.FREE)
  })

  describe('refunds & disputes', () => {
    async function paidTeam() {
      const t = await team()
      const { txnId } = await activatePaid(t, uid('sub'))
      return { t, txnId }
    }

    it('pending_approval refund changes nothing; approval revokes; redelivery/updated does not double-count', async () => {
      const { t, txnId } = await paidTeam()
      const adjId = uid('adj')

      await deliver(envelope('adjustment.created', adjustment({ id: adjId, transactionId: txnId, status: 'pending_approval', total: '4900', customerId: t.paddleCustomerId! })))
      expect((await getTeam(t.id)).plan).toBe(PlanType.STARTER)
      expect((await prisma.invoice.findUniqueOrThrow({ where: { paddleTransactionId: txnId } })).amountRefunded).toBe(0)

      await deliver(envelope('adjustment.updated', adjustment({ id: adjId, transactionId: txnId, status: 'approved', total: '4900', customerId: t.paddleCustomerId! })))
      expect((await getTeam(t.id)).plan).toBe(PlanType.FREE)
      expect((await getSub(t.id))?.status).toBe(SubscriptionStatus.refunded)
      expect((await prisma.invoice.findUniqueOrThrow({ where: { paddleTransactionId: txnId } })).amountRefunded).toBe(4900)

      // another delivery of the same adjustment state (different event id) must not add 4900 again
      await deliver(envelope('adjustment.updated', adjustment({ id: adjId, transactionId: txnId, status: 'approved', total: '4900', customerId: t.paddleCustomerId! })))
      const inv = await prisma.invoice.findUniqueOrThrow({ where: { paddleTransactionId: txnId } })
      expect(inv.amountRefunded).toBe(4900)
      expect(inv.status).toBe('refunded')
      expect(await prisma.refund.count({ where: { teamId: t.id } })).toBe(1)
    })

    it('rejected refund never revokes access', async () => {
      const { t, txnId } = await paidTeam()
      await deliver(envelope('adjustment.created', adjustment({ id: uid('adj'), transactionId: txnId, status: 'rejected', total: '4900', customerId: t.paddleCustomerId! })))
      expect((await getTeam(t.id)).plan).toBe(PlanType.STARTER)
      expect((await prisma.invoice.findUniqueOrThrow({ where: { paddleTransactionId: txnId } })).amountRefunded).toBe(0)
    })

    it('partial refunds accumulate once per adjustment and keep the plan', async () => {
      const { t, txnId } = await paidTeam()
      const a1 = uid('adj')
      const a2 = uid('adj')
      await deliver(envelope('adjustment.created', adjustment({ id: a1, transactionId: txnId, status: 'approved', total: '1000', customerId: t.paddleCustomerId! })))
      await deliver(envelope('adjustment.created', adjustment({ id: a2, transactionId: txnId, status: 'approved', total: '1000', customerId: t.paddleCustomerId! })))
      await deliver(envelope('adjustment.updated', adjustment({ id: a1, transactionId: txnId, status: 'approved', total: '1000', customerId: t.paddleCustomerId! })))
      expect((await prisma.invoice.findUniqueOrThrow({ where: { paddleTransactionId: txnId } })).amountRefunded).toBe(2000)
      expect((await getTeam(t.id)).plan).toBe(PlanType.STARTER)
    })

    it('chargeback is surfaced for review and revokes access when it covers the paid invoice', async () => {
      const { t, txnId } = await paidTeam()
      const r = await deliver(envelope('adjustment.created', adjustment({ id: uid('adj'), transactionId: txnId, action: 'chargeback', status: 'approved', total: '4900', customerId: t.paddleCustomerId! })))
      expect(r.status).toBe('NEEDS_ATTENTION')
      expect((await getTeam(t.id)).plan).toBe(PlanType.FREE)
    })

    it('refund for an invoice not recorded yet is RETRIED (throws), not lost', async () => {
      const t = await team()
      const body = envelope('adjustment.created', adjustment({ id: uid('adj'), transactionId: uid('txn'), status: 'approved', total: '100', customerId: t.paddleCustomerId! }))
      await expect(deliver(body)).rejects.toThrow(/not recorded yet/)
      expect((await prisma.paddleWebhookEvent.findUniqueOrThrow({ where: { eventId: body.event_id } })).status).toBe('FAILED')
    })
  })

  describe('renewals & failed payments', () => {
    it('successful renewal starts a new period and resets quota; a replay in the same period does not', async () => {
      const t = await team()
      const subId = uid('sub')
      const { start, end } = await activatePaid(t, subId)
      await prisma.team.update({ where: { id: t.id }, data: { meetingsUsed: 12 } })

      const renewTxn = transaction({ id: uid('txn'), subscriptionId: subId, customerId: t.paddleCustomerId!, teamId: t.id, total: '4900', periodStart: end, periodEnd: new Date(end.getTime() + 30 * DAY) })
      await deliver(envelope('transaction.completed', renewTxn, { occurredAt: new Date(end.getTime()) }))
      let tm = await getTeam(t.id)
      expect(tm.meetingsUsed).toBe(0)
      expect(tm.billingCycleStart?.getTime()).toBe(end.getTime())

      await prisma.team.update({ where: { id: t.id }, data: { meetingsUsed: 7 } })
      // same period delivered again under a different event id (e.g. transaction + subscription.updated for one renewal)
      await deliver(envelope('subscription.updated', subscription({ id: subId, status: 'active', customerId: t.paddleCustomerId!, teamId: t.id, periodStart: end, periodEnd: new Date(end.getTime() + 30 * DAY) }), { occurredAt: new Date(end.getTime() + 1000) }))
      await deliver(envelope('transaction.completed', { ...renewTxn }))
      expect((await getTeam(t.id)).meetingsUsed).toBe(7)
      expect(start.getTime()).toBeLessThan(end.getTime())
    })

    it('failed renewal: past_due keeps access for the 7-day grace window, then drops to Free; payment restores it', async () => {
      const t = await team()
      const subId = uid('sub')
      const { end } = await activatePaid(t, subId)

      await deliver(envelope('subscription.past_due', subscription({ id: subId, status: 'past_due', customerId: t.paddleCustomerId!, teamId: t.id, periodStart: end, periodEnd: new Date(end.getTime() + 30 * DAY) })))
      let tm = await getTeam(t.id)
      expect(tm.plan).toBe(PlanType.STARTER)
      expect(tm.gracePeriodEnd!.getTime() - Date.now()).toBeGreaterThan(6.9 * DAY)
      expect(tm.gracePeriodEnd!.getTime() - Date.now()).toBeLessThan(7.1 * DAY)

      // grace elapses → sweeper persists the downgrade
      await runEntitlementSync(new Date(Date.now() + 8 * DAY))
      expect((await getTeam(t.id)).plan).toBe(PlanType.FREE)

      // customer fixes the card → Paddle sends subscription.updated(active)
      await deliver(envelope('subscription.updated', subscription({ id: subId, status: 'active', customerId: t.paddleCustomerId!, teamId: t.id, periodStart: end, periodEnd: new Date(end.getTime() + 30 * DAY) }), { occurredAt: new Date(Date.now() + 9 * DAY) }))
      tm = await getTeam(t.id)
      expect(tm.plan).toBe(PlanType.STARTER)
      expect(tm.gracePeriodEnd).toBeNull()
    })

    it('payment_failed never downgrades an already-paid invoice (out-of-order safe)', async () => {
      const t = await team()
      const { txnId } = await activatePaid(t, uid('sub'))
      await deliver(envelope('transaction.payment_failed', transaction({ id: txnId, customerId: t.paddleCustomerId!, teamId: t.id, total: '4900' })))
      expect((await prisma.invoice.findUniqueOrThrow({ where: { paddleTransactionId: txnId } })).status).toBe('paid')
    })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('14-day free trial expiration', () => {
  it('trial creation: 14 days, Paddle-provided dates, paid features during trial', async () => {
    const t = await team()
    const { start, end } = await startTrial(t, uid('sub'))
    const sub = await getSub(t.id)
    expect(sub?.status).toBe(SubscriptionStatus.trialing)
    expect(sub!.trialEnd!.getTime() - sub!.trialStart!.getTime()).toBe(14 * DAY)
    expect(sub!.trialStart!.getTime()).toBe(start.getTime())
    expect(sub!.trialEnd!.getTime()).toBe(end.getTime())
    expect((await getTeam(t.id)).plan).toBe(PlanType.STARTER)
    expect((await getTeamEntitlement(t.id)).plan).toBe(PlanType.STARTER)
    expect((notifyQueue.add as jest.Mock).mock.calls.some((c) => c[1].type === 'TRIAL_STARTED')).toBe(true)
  })

  it('exact boundary: not expired at trialEnd-1ms, expired at trialEnd (cron path)', async () => {
    const t = await team()
    const { end } = await startTrial(t, uid('sub'))

    const early = await billingRepo.expireTeamEntitlement(t.id, new Date(end.getTime() - 1))
    expect(early.transitioned).toBe('none')
    expect((await getTeam(t.id)).plan).toBe(PlanType.STARTER)

    const exact = await billingRepo.expireTeamEntitlement(t.id, end)
    expect(exact).toMatchObject({ transitioned: 'trial_expired', from: PlanType.STARTER, to: PlanType.FREE })
    expect((await getTeam(t.id)).plan).toBe(PlanType.FREE)
    const sub = await getSub(t.id)
    expect(sub?.status).toBe(SubscriptionStatus.cancelled)
    expect(await prisma.billingAuditLog.count({ where: { teamId: t.id, action: 'TRIAL_EXPIRED' } })).toBe(1)
  })

  it('automatic Free transition via the 5-minute sweeper (Paddle unreachable → server clock decides)', async () => {
    const t = await team()
    await startTrial(t, uid('sub'), { start: ago(15 * DAY) }) // trial ended yesterday
    paddleMock.subscriptions.get.mockRejectedValue(new Error('ECONNRESET'))

    const summary = await runEntitlementSync()
    expect(summary.trialsExpired).toBeGreaterThanOrEqual(1)
    expect((await getTeam(t.id)).plan).toBe(PlanType.FREE)
    expect((await getSub(t.id))?.status).toBe(SubscriptionStatus.cancelled)
  })

  it('premium entitlement is removed at the boundary EVEN IF the cron never ran (read-time server clock)', async () => {
    const t = await team()
    await startTrial(t, uid('sub'))
    // Time passes WITHOUT any webhook or cron run: the trial window closes in the past.
    await prisma.subscription.update({ where: { teamId: t.id }, data: { trialStart: ago(14 * DAY + 1000), trialEnd: ago(1000), currentPeriodEnd: ago(1000) } })
    // Team.plan still says STARTER (stale) and Subscription still says trialing — nothing has swept yet.
    expect((await getTeam(t.id)).plan).toBe(PlanType.STARTER)
    expect((await getSub(t.id))?.status).toBe(SubscriptionStatus.trialing)
    expect((await getTeamEntitlement(t.id)).plan).toBe(PlanType.FREE)
    expect((await getTeamEntitlement(t.id)).reason).toBe('trial_expired')
  })

  it('paid upgrade BEFORE expiration is never downgraded by the sweeper', async () => {
    const t = await team()
    const subId = uid('sub')
    const { start, end } = await startTrial(t, subId, { start: ago(10 * DAY) })
    // user converts on day 10; Paddle ends the trial and starts the paid period
    await deliver(envelope('subscription.updated', subscription({ id: subId, status: 'active', customerId: t.paddleCustomerId!, teamId: t.id, periodStart: ago(1000), periodEnd: ahead(30 * DAY) }), { occurredAt: ago(500) }))
    await runEntitlementSync(new Date(end.getTime() + DAY))
    expect(start.getTime()).toBeLessThan(end.getTime())
    expect((await getTeam(t.id)).plan).toBe(PlanType.STARTER)
    expect((await getSub(t.id))?.status).toBe(SubscriptionStatus.active)
  })

  it('upgrade AROUND the boundary with a LATE webhook: the sweeper asks Paddle first and does not downgrade a converted customer', async () => {
    const t = await team()
    const subId = uid('sub')
    await startTrial(t, subId, { start: ago(14 * DAY + 1000) }) // trial ended 1s ago, DB still says trialing
    // Paddle already converted it; the subscription.updated webhook has not arrived yet.
    paddleMock.subscriptions.get.mockResolvedValue(
      subscription({ id: subId, status: 'active', customerId: t.paddleCustomerId!, teamId: t.id, periodStart: ago(1000), periodEnd: ahead(30 * DAY) })
    )
    await runEntitlementSync()
    expect((await getSub(t.id))?.status).toBe(SubscriptionStatus.active)
    expect((await getTeam(t.id)).plan).toBe(PlanType.STARTER)
    expect(await prisma.billingAuditLog.count({ where: { teamId: t.id, action: 'TRIAL_EXPIRED' } })).toBe(0)
  })

  it('late Paddle webhook after a local expiry restores a customer who actually converted', async () => {
    const t = await team()
    const subId = uid('sub')
    const created = ago(15 * DAY)
    await startTrial(t, subId, { start: created })
    paddleMock.subscriptions.get.mockRejectedValue(new Error('paddle down')) // job could not verify → expires locally
    await runEntitlementSync()
    expect((await getTeam(t.id)).plan).toBe(PlanType.FREE)

    // …hours later the delayed webhook arrives (occurred_at is AFTER the trial events already applied)
    await deliver(envelope('subscription.updated', subscription({ id: subId, status: 'active', customerId: t.paddleCustomerId!, teamId: t.id, periodStart: ago(DAY), periodEnd: ahead(29 * DAY) }), { occurredAt: ago(DAY) }))
    expect((await getSub(t.id))?.status).toBe(SubscriptionStatus.active)
    expect((await getTeam(t.id)).plan).toBe(PlanType.STARTER)
  })

  it('hourly reconciliation heals a customer who was expired locally but is active in Paddle', async () => {
    const t = await team()
    const subId = uid('sub')
    await startTrial(t, subId, { start: ago(15 * DAY) })
    paddleMock.subscriptions.get.mockRejectedValueOnce(new Error('paddle down'))
    await runEntitlementSync()
    expect((await getTeam(t.id)).plan).toBe(PlanType.FREE)

    paddleMock.subscriptions.get.mockResolvedValue(
      subscription({ id: subId, status: 'active', customerId: t.paddleCustomerId!, teamId: t.id, periodStart: ago(DAY), periodEnd: ahead(29 * DAY) })
    )
    const r = await runReconciliation()
    expect(r.healed).toBeGreaterThanOrEqual(1)
    expect((await getTeam(t.id)).plan).toBe(PlanType.STARTER)
  })

  it('repeated and concurrent expiration runs are idempotent: one transition, one audit row', async () => {
    const t = await team()
    await startTrial(t, uid('sub'), { start: ago(15 * DAY) })
    paddleMock.subscriptions.get.mockRejectedValue(new Error('down'))

    const results = await Promise.all(Array.from({ length: 6 }, () => billingRepo.expireTeamEntitlement(t.id)))
    expect(results.filter((r) => r.transitioned === 'trial_expired')).toHaveLength(1)
    await runEntitlementSync()
    await runEntitlementSync()
    expect(await prisma.billingAuditLog.count({ where: { teamId: t.id, action: 'TRIAL_EXPIRED' } })).toBe(1)
    expect((await getTeam(t.id)).plan).toBe(PlanType.FREE)
  })

  it('a paid (active) subscription whose old trialEnd is in the past is untouched by the expiry job', async () => {
    const t = await team()
    const subId = uid('sub')
    await startTrial(t, subId, { start: ago(40 * DAY) })
    await deliver(envelope('subscription.updated', subscription({ id: subId, status: 'active', customerId: t.paddleCustomerId!, teamId: t.id, periodStart: ago(26 * DAY), periodEnd: ahead(4 * DAY) }), { occurredAt: ago(26 * DAY) }))
    const r = await billingRepo.expireTeamEntitlement(t.id)
    expect(r.transitioned).toBe('none')
    expect((await getTeam(t.id)).plan).toBe(PlanType.STARTER)
  })

  it('database failure during expiration: that team errors, others still expire, and the next run completes it', async () => {
    const a = await team()
    const b = await team()
    await startTrial(a, uid('sub'), { start: ago(15 * DAY) })
    await startTrial(b, uid('sub'), { start: ago(15 * DAY) })
    paddleMock.subscriptions.get.mockRejectedValue(new Error('down'))

    const real = billingRepo.expireTeamEntitlement
    const spy = jest.spyOn(billingRepo, 'expireTeamEntitlement').mockImplementation(async (teamId, now) => {
      if (teamId === a.id) throw new Error('connection refused')
      return real(teamId, now)
    })
    const first = await runEntitlementSync()
    expect(first.errors).toBeGreaterThanOrEqual(1)
    expect((await getTeam(b.id)).plan).toBe(PlanType.FREE)
    // A is still not persisted as expired, but read-time entitlement already denies access:
    expect((await getTeamEntitlement(a.id)).plan).toBe(PlanType.FREE)

    spy.mockRestore()
    await runEntitlementSync() // DB is back: retry-safe
    expect((await getTeam(a.id)).plan).toBe(PlanType.FREE)
    expect((await getSub(a.id))?.status).toBe(SubscriptionStatus.cancelled)
  })

  it('an expired user can start a NEW paid subscription normally (dead sub replaced, history preserved)', async () => {
    const t = await team()
    const oldSub = uid('sub')
    const newSub = uid('sub')
    await startTrial(t, oldSub, { start: ago(15 * DAY) })
    paddleMock.subscriptions.get.mockRejectedValue(new Error('down'))
    await runEntitlementSync()
    expect((await getTeam(t.id)).plan).toBe(PlanType.FREE)

    await activatePaid(t, newSub)
    expect((await getTeam(t.id)).plan).toBe(PlanType.STARTER)
    expect((await getSub(t.id))?.paddleSubscriptionId).toBe(newSub)
    const archived = await prisma.billingAuditLog.findFirst({ where: { teamId: t.id, action: 'SUBSCRIPTION_REPLACED' } })
    expect((archived?.payload as any).previous.paddleSubscriptionId).toBe(oldSub)
  })

  it('two sessions / devices see the same server-derived plan (entitlement is per team, not per session)', async () => {
    const t = await team()
    await startTrial(t, uid('sub'), { start: ago(15 * DAY) })
    const [s1, s2, s3] = await Promise.all([getTeamEntitlement(t.id), getTeamEntitlement(t.id), getTeamEntitlement(t.id)])
    expect([s1.plan, s2.plan, s3.plan]).toEqual([PlanType.FREE, PlanType.FREE, PlanType.FREE])
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('State consistency invariant (property test over random event orders)', () => {
  // Seeded PRNG ⇒ reproducible failures.
  function rng(seed: number) {
    let s = seed
    return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296)
  }

  it('Team.plan always equals resolveEntitlement(subscription) after any sequence of lifecycle events', async () => {
    for (let seed = 1; seed <= 12; seed++) {
      const rand = rng(seed)
      const t = await team()
      const subId = uid('sub')
      const base = Date.now() - 20 * DAY
      const statuses = ['trialing', 'active', 'past_due', 'paused', 'canceled'] as const
      const evTypes = { trialing: 'subscription.trialing', active: 'subscription.updated', past_due: 'subscription.past_due', paused: 'subscription.paused', canceled: 'subscription.canceled' } as const

      const bodies = Array.from({ length: 8 }, (_, i) => {
        const status = statuses[Math.floor(rand() * statuses.length)]
        const occurred = new Date(base + Math.floor(rand() * 10) * DAY + i)
        const periodEnd = status === 'canceled' ? null : new Date(occurred.getTime() + (status === 'trialing' ? 14 : 30) * DAY)
        return envelope(evTypes[status], subscription({ id: subId, status, customerId: t.paddleCustomerId!, teamId: t.id, periodStart: occurred, periodEnd, trialStart: occurred, trialEnd: periodEnd ?? undefined }), { occurredAt: occurred })
      })
      // random delivery order + random duplicates
      const order = bodies.map((b) => ({ b, k: rand() })).sort((x, y) => x.k - y.k).map((x) => x.b)
      for (const b of [...order, ...order.slice(0, 3)]) {
        await deliver(b).catch(() => undefined)
        await runEntitlementSync().catch(() => undefined)

        const tm = await getTeam(t.id)
        const sub = await getSub(t.id)
        const ent = resolveEntitlement({ teamPlan: tm.plan, gracePeriodEnd: tm.gracePeriodEnd, subscription: sub }, new Date())
        // persisted plan can only be ahead-of (more permissive than) read-time truth by what the sweeper will fix next tick;
        // right after a sweep + event it must be identical:
        expect({ seed, plan: tm.plan }).toEqual({ seed, plan: ent.plan })
      }
    }
  })
})
