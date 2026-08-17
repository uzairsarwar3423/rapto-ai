import { PlanType, SubscriptionStatus } from '@prisma/client'
import * as billingService from '../../src/modules/billing/billing.service'
import * as billingRepo from '../../src/modules/billing/billing.repository'
import * as paddleClient from '../../src/services/paddle.client'
import { redis } from '../../src/config/redis'

jest.mock('../../src/modules/billing/billing.repository')
jest.mock('../../src/services/paddle.client')
jest.mock('../../src/config/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    eval: jest.fn().mockResolvedValue(1),
  },
}))
jest.mock('../../src/middleware/plan-limits.middleware', () => ({
  invalidatePlanCache: jest.fn().mockResolvedValue(undefined),
}))

describe('billing.service — Business Logic & Concurrency Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getPlans', () => {
    it('returns public pricing plans from configuration without DB calls', () => {
      const plans = billingService.getPlans()
      expect(plans).toHaveLength(5)
      expect(plans.map((p) => p.id)).toEqual([
        PlanType.FREE,
        PlanType.STARTER,
        PlanType.GROWTH,
        PlanType.BUSINESS,
        PlanType.ENTERPRISE,
      ])
    })
  })

  describe('createCheckoutSession', () => {
    it('acquires tokenized distributed lock and creates checkout transaction', async () => {
      ;(redis.set as jest.Mock).mockResolvedValueOnce('OK')
      ;(billingRepo.findFullSubscriptionByTeam as jest.Mock).mockResolvedValueOnce(null)
      ;(paddleClient.getOrCreatePaddleCustomer as jest.Mock).mockResolvedValueOnce('ctm_12345')
      ;(paddleClient.createTransaction as jest.Mock).mockResolvedValueOnce({
        transactionId: 'txn_9999',
        checkoutUrl: 'https://checkout.paddle.com/txn_9999',
      })

      const result = await billingService.createCheckoutSession({
        teamId: 'team_01',
        userId: 'user_01',
        requesterEmail: 'alex@rapto.cloud',
        requesterName: 'Alex',
        planId: PlanType.STARTER,
        interval: 'month',
      })

      expect(redis.set).toHaveBeenCalledWith(
        'lock:checkout:team_01',
        expect.any(String),
        'EX',
        15,
        'NX'
      )
      expect(paddleClient.getOrCreatePaddleCustomer).toHaveBeenCalledWith(
        'team_01',
        'alex@rapto.cloud',
        'Alex'
      )
      expect(result.transactionId).toBe('txn_9999')
      expect(result.checkoutUrl).toBe('https://checkout.paddle.com/txn_9999')
      expect(redis.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'lock:checkout:team_01',
        expect.any(String)
      )
    })

    it('rejects checkout when distributed lock is already held (409 Conflict)', async () => {
      ;(redis.set as jest.Mock).mockResolvedValueOnce(null) // Lock acquisition failed

      await expect(
        billingService.createCheckoutSession({
          teamId: 'team_01',
          userId: 'user_01',
          requesterEmail: 'alex@rapto.cloud',
          requesterName: 'Alex',
          planId: PlanType.STARTER,
          interval: 'month',
        })
      ).rejects.toThrow('A checkout or subscription operation is already in progress')
    })

    it('rejects checkout when team already has an active subscription for same plan (409 Conflict)', async () => {
      ;(redis.set as jest.Mock).mockResolvedValueOnce('OK')
      ;(billingRepo.findFullSubscriptionByTeam as jest.Mock).mockResolvedValueOnce({
        plan: PlanType.STARTER,
        billingInterval: 'month',
        status: SubscriptionStatus.active,
        paddleSubscriptionId: 'sub_active_1',
      })

      await expect(
        billingService.createCheckoutSession({
          teamId: 'team_01',
          userId: 'user_01',
          requesterEmail: 'alex@rapto.cloud',
          requesterName: 'Alex',
          planId: PlanType.STARTER,
          interval: 'month',
        })
      ).rejects.toThrow("Team already has an active subscription for the 'STARTER' plan (monthly)")

      expect(redis.eval).toHaveBeenCalled() // Lock released safely
    })
  })

  describe('getUsage', () => {
    it('returns calculated usage metrics based on limits', async () => {
      ;(redis.get as jest.Mock).mockResolvedValueOnce(null)
      ;(billingRepo.getTeamForUsage as jest.Mock).mockResolvedValueOnce({
        plan: PlanType.STARTER,
        meetingsUsed: 12,
        billingCycleEnd: new Date('2026-09-01'),
        _count: { members: 3 },
      })

      const usage = await billingService.getUsage('team_01')

      expect(usage.meetingsUsed).toBe(12)
      expect(usage.meetingsLimit).toBe(40)
      expect(usage.membersCount).toBe(3)
      expect(usage.membersLimit).toBe(10)
      expect(usage.percentUsed).toBe(30) // 12/40 = 30%
    })
  })
})
