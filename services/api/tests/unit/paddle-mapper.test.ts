import '../support/billing-test-env'
import { PlanType, SubscriptionStatus } from '@prisma/client'
import {
  UnresolvableEventError,
  entityToSnake,
  extractSubscriptionData,
  mapPaddleSubscriptionStatus,
  parseMinorAmount,
  parsePaddleDate,
  resolvePlan,
  toSnake,
} from '../../src/modules/webhooks/paddle.mapper'
import { DAY, PRICES, subscription } from '../support/paddle-fixtures'

describe('paddle.mapper', () => {
  it('toSnake converts SDK camelCase but leaves merchant custom_data untouched', () => {
    const out = toSnake<any>({ customerId: 'c', customData: { teamId: 'T1', planId: 'STARTER' }, items: [{ trialDates: { startsAt: 'x' } }] })
    expect(out.customer_id).toBe('c')
    expect(out.custom_data).toEqual({ teamId: 'T1', planId: 'STARTER' })
    expect(out.items[0].trial_dates.starts_at).toBe('x')
  })

  it('entityToSnake survives class instances / Dates via JSON round-trip', () => {
    class Ent { constructor(public currentBillingPeriod = { endsAt: '2026-01-01T00:00:00Z' }) {} }
    expect((entityToSnake(new Ent()) as any).current_billing_period.ends_at).toBe('2026-01-01T00:00:00Z')
  })

  it('parsePaddleDate handles ISO, seconds, millis and garbage', () => {
    expect(parsePaddleDate('2026-01-01T00:00:00Z')?.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(parsePaddleDate(1767225600)?.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(parsePaddleDate(1767225600000)?.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(parsePaddleDate('not a date')).toBeUndefined()
    expect(parsePaddleDate(null)).toBeUndefined()
  })

  it('parseMinorAmount rejects non-numeric amounts instead of silently returning 0', () => {
    expect(parseMinorAmount('4900')).toBe(4900)
    expect(parseMinorAmount(undefined)).toBe(0)
    expect(() => parseMinorAmount('NaN$')).toThrow(UnresolvableEventError)
  })

  it('status mapping is strict — unknown statuses must not become active (fail-open)', () => {
    expect(mapPaddleSubscriptionStatus('canceled')).toBe(SubscriptionStatus.cancelled)
    expect(mapPaddleSubscriptionStatus('trialing')).toBe(SubscriptionStatus.trialing)
    expect(() => mapPaddleSubscriptionStatus('mystery')).toThrow(UnresolvableEventError)
  })

  describe('resolvePlan', () => {
    it('price ID wins over a stale custom_data plan', () => {
      const d = { ...subscription({ id: 'sub_1', status: 'active', teamId: 't', priceId: PRICES.GROWTH_M }), custom_data: { teamId: 't', planId: 'STARTER', interval: 'month' } }
      expect(resolvePlan(d)).toMatchObject({ planId: PlanType.GROWTH, source: 'price' })
    })

    it('falls back to custom_data only when the price is unmapped', () => {
      const d = { ...subscription({ id: 'sub_1', status: 'active', teamId: 't', priceId: PRICES.UNKNOWN }) }
      expect(resolvePlan(d)).toMatchObject({ planId: PlanType.STARTER, source: 'custom_data' })
    })

    it('throws (never defaults to FREE) when neither resolves', () => {
      const d = { ...subscription({ id: 'sub_1', status: 'active', priceId: PRICES.UNKNOWN }), custom_data: null }
      expect(() => resolvePlan(d)).toThrow(UnresolvableEventError)
    })

    it('does not accept FREE via custom_data', () => {
      const d = { ...subscription({ id: 'sub_1', status: 'active', priceId: PRICES.UNKNOWN }), custom_data: { planId: 'FREE' } }
      expect(() => resolvePlan(d)).toThrow(UnresolvableEventError)
    })
  })

  describe('extractSubscriptionData', () => {
    const now = new Date('2026-09-01T00:00:00Z')

    it('maps a 14-day trial with Paddle-provided trial_dates', () => {
      const start = now
      const end = new Date(now.getTime() + 14 * DAY)
      const d = extractSubscriptionData(subscription({ id: 'sub_t', status: 'trialing', periodStart: start, periodEnd: end, trialStart: start, trialEnd: end }), PlanType.STARTER, 'month', now)
      expect(d.status).toBe(SubscriptionStatus.trialing)
      expect(d.trialStart).toEqual(start)
      expect(d.trialEnd).toEqual(end)
      expect(d.trialEnd!.getTime() - d.trialStart!.getTime()).toBe(14 * DAY)
      expect(d.unitAmount).toBe(4900)
      expect(d.currency).toBe('usd')
    })

    it('status "canceled" means access ended — it is never reinterpreted as paid-through, even with a period attached', () => {
      const end = new Date(now.getTime() + 10 * DAY)
      const d = extractSubscriptionData(subscription({ id: 'sub_c', status: 'canceled', periodStart: now, periodEnd: end }), PlanType.STARTER, 'month', now)
      expect(d.status).toBe(SubscriptionStatus.cancelled)
      expect(d.cancelAtPeriodEnd).toBe(false)
    })

    it('a cancellation with no running period is a real cancellation', () => {
      const d = extractSubscriptionData(subscription({ id: 'sub_c', status: 'canceled', periodStart: now, periodEnd: null }), PlanType.STARTER, 'month', now)
      expect(d.status).toBe(SubscriptionStatus.cancelled)
    })

    it('scheduled_change.cancel sets cancelAtPeriodEnd', () => {
      const d = extractSubscriptionData(subscription({ id: 'sub_s', status: 'active', periodStart: now, periodEnd: new Date(now.getTime() + DAY), scheduledCancel: true }), PlanType.STARTER, 'month', now)
      expect(d.cancelAtPeriodEnd).toBe(true)
      expect(d.status).toBe(SubscriptionStatus.active)
    })
  })
})
