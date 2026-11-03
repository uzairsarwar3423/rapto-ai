import { PlanType, SubscriptionStatus } from '@prisma/client'
import { resolveEntitlement, ttlSecondsUntil, isLiveSubscriptionStatus } from '../../src/modules/billing/entitlement'

const T0 = new Date('2026-09-01T00:00:00.000Z')
const at = (ms: number) => new Date(T0.getTime() + ms)
const DAY = 86_400_000

const sub = (over: Partial<Parameters<typeof resolveEntitlement>[0]['subscription'] & object> = {}) => ({
  status: SubscriptionStatus.active,
  plan: PlanType.GROWTH,
  trialEnd: null,
  currentPeriodEnd: at(30 * DAY),
  cancelAtPeriodEnd: false,
  ...over,
})
const input = (subscription: any, extra: any = {}) => ({ teamPlan: PlanType.GROWTH, gracePeriodEnd: null, subscription, ...extra })

describe('resolveEntitlement — single source of truth for access', () => {
  describe('14-day trial boundary', () => {
    const trialEnd = at(14 * DAY)
    const trial = sub({ status: SubscriptionStatus.trialing, trialEnd, currentPeriodEnd: trialEnd })

    it('grants the paid plan one millisecond before the trial ends', () => {
      const e = resolveEntitlement(input(trial), at(14 * DAY - 1))
      expect(e.plan).toBe(PlanType.GROWTH)
      expect(e.reason).toBe('trialing')
      expect(e.validUntil).toEqual(trialEnd)
    })

    it('revokes at the exact expiration instant (trialEnd <= now)', () => {
      const e = resolveEntitlement(input(trial), trialEnd)
      expect(e.plan).toBe(PlanType.FREE)
      expect(e.reason).toBe('trial_expired')
    })

    it('stays revoked afterwards (stale Team.plan = GROWTH cannot resurrect access)', () => {
      expect(resolveEntitlement(input(trial), at(60 * DAY)).plan).toBe(PlanType.FREE)
    })

    it('fails closed when a trial has no provable end date', () => {
      const e = resolveEntitlement(input(sub({ status: SubscriptionStatus.trialing, trialEnd: null, currentPeriodEnd: null })), T0)
      expect(e.plan).toBe(PlanType.FREE)
    })

    it('a trial that converted to active keeps the plan even though trialEnd is in the past', () => {
      const converted = sub({ status: SubscriptionStatus.active, trialEnd, currentPeriodEnd: at(44 * DAY) })
      expect(resolveEntitlement(input(converted), at(20 * DAY)).plan).toBe(PlanType.GROWTH)
    })
  })

  describe('paid lifecycle', () => {
    it('active is entitled with no expiry', () => {
      expect(resolveEntitlement(input(sub()), T0)).toMatchObject({ plan: PlanType.GROWTH, reason: 'active', validUntil: null })
    })

    it('scheduled cancellation keeps access through the paid period, then drops it', () => {
      const s = sub({ cancelAtPeriodEnd: true, currentPeriodEnd: at(10 * DAY) })
      expect(resolveEntitlement(input(s), at(10 * DAY - 1)).plan).toBe(PlanType.GROWTH)
      expect(resolveEntitlement(input(s), at(10 * DAY - 1)).reason).toBe('cancel_scheduled')
      expect(resolveEntitlement(input(s), at(10 * DAY)).plan).toBe(PlanType.FREE)
    })

    it('past_due is entitled only inside the grace window', () => {
      const s = sub({ status: SubscriptionStatus.past_due })
      const grace = at(7 * DAY)
      expect(resolveEntitlement(input(s, { gracePeriodEnd: grace }), at(7 * DAY - 1)).plan).toBe(PlanType.GROWTH)
      expect(resolveEntitlement(input(s, { gracePeriodEnd: grace }), grace).plan).toBe(PlanType.FREE)
      expect(resolveEntitlement(input(s, { gracePeriodEnd: null }), T0).plan).toBe(PlanType.FREE)
    })

    it.each([
      SubscriptionStatus.cancelled,
      SubscriptionStatus.paused,
      SubscriptionStatus.refunded,
      SubscriptionStatus.unpaid,
      SubscriptionStatus.incomplete,
      SubscriptionStatus.incomplete_expired,
    ])('%s is never entitled', (status) => {
      expect(resolveEntitlement(input(sub({ status })), T0).plan).toBe(PlanType.FREE)
    })
  })

  describe('teams without a subscription row', () => {
    it('honours Team.plan (manual / enterprise grant) — documented business assumption', () => {
      expect(resolveEntitlement({ teamPlan: PlanType.ENTERPRISE, gracePeriodEnd: null, subscription: null }, T0).plan).toBe(PlanType.ENTERPRISE)
      expect(resolveEntitlement({ teamPlan: PlanType.FREE, gracePeriodEnd: null, subscription: null }, T0).plan).toBe(PlanType.FREE)
    })
  })
})

describe('helpers', () => {
  it('ttlSecondsUntil never outlives the entitlement boundary', () => {
    expect(ttlSecondsUntil(null, 3600, T0)).toBe(3600)
    expect(ttlSecondsUntil(at(90_000), 3600, T0)).toBe(90)
    expect(ttlSecondsUntil(at(10 * 3600_000), 3600, T0)).toBe(3600)
    expect(ttlSecondsUntil(at(-5_000), 3600, T0)).toBe(1) // already past → shortest possible TTL
  })

  it('isLiveSubscriptionStatus marks statuses Paddle may still bill', () => {
    expect(isLiveSubscriptionStatus(SubscriptionStatus.active)).toBe(true)
    expect(isLiveSubscriptionStatus(SubscriptionStatus.past_due)).toBe(true)
    expect(isLiveSubscriptionStatus(SubscriptionStatus.cancelled)).toBe(false)
    expect(isLiveSubscriptionStatus(SubscriptionStatus.refunded)).toBe(false)
  })
})
