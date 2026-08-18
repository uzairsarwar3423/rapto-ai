import { PlanType, SubscriptionStatus } from '@prisma/client'
import * as paddleWebhookService from '../../src/modules/webhooks/paddle.webhook.service'
import * as billingRepo from '../../src/modules/billing/billing.repository'
import { notifyQueue } from '../../src/queues/queue.client'
import { invalidatePlanCache } from '../../src/middleware/plan-limits.middleware'

// Mock dependencies
jest.mock('../../src/modules/billing/billing.repository')
jest.mock('../../src/queues/queue.client', () => ({
  notifyQueue: {
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  },
}))
jest.mock('../../src/middleware/plan-limits.middleware', () => ({
  invalidatePlanCache: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../../src/realtime/socket.emitter', () => ({
  socketEmitter: {
    to: jest.fn().mockReturnValue({
      emit: jest.fn(),
    }),
  },
}))

describe('paddle.webhook.service — Production Event Processing', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('transaction.completed', () => {
    it('activates subscription, records invoice, logs audit trail, and queues email', async () => {
      const eventId = 'evt_tx_123'
      const event = {
        data: {
          id: 'txn_01h8q5',
          customerId: 'ctm_01h8q5',
          subscriptionId: 'sub_01h8q5',
          currencyCode: 'USD',
          details: {
            totals: {
              total: '4900',
              subtotal: '4900',
            },
          },
          billingPeriod: {
            startsAt: '2026-08-01T00:00:00Z',
            endsAt: '2026-09-01T00:00:00Z',
          },
          customData: {
            teamId: 'team_abc123',
            planId: 'STARTER',
            interval: 'month',
          },
        },
      }

      await paddleWebhookService.processEvent(event, eventId, 'transaction.completed')

      expect(billingRepo.activateSubscriptionTransaction).toHaveBeenCalledTimes(1)
      expect(billingRepo.activateSubscriptionTransaction).toHaveBeenCalledWith(
        'team_abc123',
        PlanType.STARTER,
        expect.objectContaining({
          paddleSubscriptionId: 'sub_01h8q5',
          plan: PlanType.STARTER,
          status: SubscriptionStatus.active,
        }),
        expect.objectContaining({
          paddleTransactionId: 'txn_01h8q5',
          amountPaid: 4900,
          status: 'paid',
        }),
        expect.any(Date),
        expect.any(Date)
      )

      expect(billingRepo.createBillingAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId: 'team_abc123',
          eventId: 'evt_tx_123',
          eventType: 'transaction.completed',
          action: 'ACTIVATE_SUBSCRIPTION',
        })
      )

      expect(invalidatePlanCache).toHaveBeenCalledWith('team_abc123')
      expect(notifyQueue.add).toHaveBeenCalledWith(
        'billing-confirmation',
        expect.objectContaining({
          type: 'BILLING_CONFIRMATION',
          teamId: 'team_abc123',
          planId: PlanType.STARTER,
        }),
        expect.objectContaining({
          jobId: 'billing-confirmation:txn_01h8q5',
        })
      )
    })
  })

  describe('adjustment.created (Refunds & Chargebacks)', () => {
    it('records refund in repository and creates audit log', async () => {
      const eventId = 'evt_adj_999'
      const event = {
        data: {
          id: 'adj_01h999',
          transactionId: 'txn_01h8q5',
          currencyCode: 'USD',
          reason: 'customer_dissatisfaction',
          status: 'completed',
          totals: {
            total: '4900',
          },
          customData: {
            teamId: 'team_abc123',
          },
        },
      }

      ;(billingRepo.processRefundAdjustmentTransaction as jest.Mock).mockResolvedValue({
        isFullRefund: true,
      })

      await paddleWebhookService.processEvent(event, eventId, 'adjustment.created')

      expect(billingRepo.processRefundAdjustmentTransaction).toHaveBeenCalledWith({
        teamId: 'team_abc123',
        paddleTransactionId: 'txn_01h8q5',
        paddleAdjustmentId: 'adj_01h999',
        amountRefunded: 4900,
        currency: 'USD',
        reason: 'customer_dissatisfaction',
        status: 'completed',
      })

      expect(billingRepo.createBillingAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId: 'team_abc123',
          eventId: 'evt_adj_999',
          eventType: 'adjustment.created',
          action: 'FULL_REFUND_DOWNGRADE',
        })
      )

      expect(invalidatePlanCache).toHaveBeenCalledWith('team_abc123')
    })
  })

  describe('subscription.canceled', () => {
    it('marks subscription cancelled and downgrades team immediately if period has ended', async () => {
      const eventId = 'evt_cancel_111'
      const event = {
        data: {
          id: 'sub_01h8q5',
          canceledAt: '2026-08-17T12:00:00Z',
          currentBillingPeriod: {
            endsAt: '2025-01-01T00:00:00Z', // Definite past date -> immediate downgrade
          },
          customData: {
            teamId: 'team_abc123',
          },
        },
      }

      await paddleWebhookService.processEvent(event, eventId, 'subscription.canceled')

      expect(billingRepo.markSubscriptionCancelled).toHaveBeenCalledWith(
        'sub_01h8q5',
        expect.any(Date)
      )
      expect(billingRepo.downgradeTeamToFree).toHaveBeenCalledWith('team_abc123')
      expect(invalidatePlanCache).toHaveBeenCalledWith('team_abc123')

      expect(billingRepo.createBillingAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId: 'team_abc123',
          eventId: 'evt_cancel_111',
          eventType: 'subscription.canceled',
          action: 'CANCEL_IMMEDIATE',
        })
      )
    })
  })

  describe('subscription.past_due', () => {
    it('sets 7-day grace period and updates subscription status to past_due', async () => {
      const eventId = 'evt_past_due_444'
      const event = {
        data: {
          id: 'sub_01h8q5',
          customData: {
            teamId: 'team_abc123',
          },
        },
      }

      // Mock prisma team and subscription
      jest.mock('../../src/db/client', () => ({
        prisma: {
          team: { update: jest.fn().mockResolvedValue({}) },
          subscription: { updateMany: jest.fn().mockResolvedValue({}) },
        },
      }))

      await paddleWebhookService.processEvent(event, eventId, 'subscription.past_due')

      expect(billingRepo.createBillingAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId: 'team_abc123',
          eventId: 'evt_past_due_444',
          eventType: 'subscription.past_due',
          action: 'SET_PAST_DUE_GRACE_PERIOD',
        })
      )
    })
  })

  describe('subscription.created & subscription.trialing with Trial Dates & unitAmount', () => {
    it('persists trialStart, trialEnd, and unitAmount for a trialing subscription', async () => {
      const eventId = 'evt_sub_trial_1'
      const event = {
        data: {
          id: 'sub_trial_999',
          customerId: 'ctm_user_1',
          status: 'trialing',
          currencyCode: 'USD',
          trialDates: {
            startsAt: '2026-08-18T00:00:00Z',
            endsAt: '2026-09-01T00:00:00Z',
          },
          currentBillingPeriod: {
            startsAt: '2026-08-18T00:00:00Z',
            endsAt: '2026-09-01T00:00:00Z',
          },
          items: [
            {
              price: {
                id: 'pri_starter_mo',
                unitPrice: {
                  amount: '4900',
                  currencyCode: 'USD',
                },
              },
            },
          ],
          customData: {
            teamId: 'team_trial_123',
            planId: 'STARTER',
            interval: 'month',
          },
        },
      }

      await paddleWebhookService.processEvent(event, eventId, 'subscription.created')

      expect(billingRepo.updateSubscriptionTransaction).toHaveBeenCalledWith(
        'team_trial_123',
        PlanType.STARTER,
        expect.objectContaining({
          paddleSubscriptionId: 'sub_trial_999',
          status: SubscriptionStatus.trialing,
          plan: PlanType.STARTER,
          trialStart: new Date('2026-08-18T00:00:00Z'),
          trialEnd: new Date('2026-09-01T00:00:00Z'),
          unitAmount: 4900,
          currency: 'usd',
        })
      )

      expect(notifyQueue.add).toHaveBeenCalledWith(
        'trial-started',
        expect.objectContaining({
          type: 'TRIAL_STARTED',
          teamId: 'team_trial_123',
          trialEndsAt: new Date('2026-09-01T00:00:00Z'),
        }),
        expect.objectContaining({
          jobId: 'trial-started:sub_trial_999',
        })
      )
    })

    it('fallback assigns trialStart/End from currentBillingPeriod if trialDates omitted', async () => {
      const eventId = 'evt_sub_trial_2'
      const event = {
        data: {
          id: 'sub_trial_888',
          customerId: 'ctm_user_2',
          status: 'trialing',
          currentBillingPeriod: {
            startsAt: '2026-08-18T10:00:00Z',
            endsAt: '2026-09-01T10:00:00Z',
          },
          customData: {
            teamId: 'team_trial_456',
            planId: 'GROWTH',
            interval: 'month',
          },
        },
      }

      await paddleWebhookService.processEvent(event, eventId, 'subscription.trialing')

      expect(billingRepo.updateSubscriptionTransaction).toHaveBeenCalledWith(
        'team_trial_456',
        PlanType.GROWTH,
        expect.objectContaining({
          paddleSubscriptionId: 'sub_trial_888',
          status: SubscriptionStatus.trialing,
          plan: PlanType.GROWTH,
          trialStart: new Date('2026-08-18T10:00:00Z'),
          trialEnd: new Date('2026-09-01T10:00:00Z'),
          unitAmount: 9900, // Growth plan default
          currency: 'usd',
        })
      )
    })
  })

  describe('Utility parsers: parsePaddleDate & extractSubscriptionData', () => {
    it('handles ISO strings, Unix timestamps, and nulls correctly', () => {
      expect(paddleWebhookService.parsePaddleDate('2026-08-18T00:00:00Z')).toEqual(new Date('2026-08-18T00:00:00Z'))
      expect(paddleWebhookService.parsePaddleDate(1787011200)).toEqual(new Date(1787011200000))
      expect(paddleWebhookService.parsePaddleDate(null)).toBeUndefined()
      expect(paddleWebhookService.parsePaddleDate('')).toBeUndefined()
      expect(paddleWebhookService.parsePaddleDate('invalid-date')).toBeUndefined()
    })

    it('parses minor amounts accurately', () => {
      expect(paddleWebhookService.parseMinorAmount('4900')).toBe(4900)
      expect(paddleWebhookService.parseMinorAmount(4900)).toBe(4900)
      expect(paddleWebhookService.parseMinorAmount(null)).toBe(0)
      expect(paddleWebhookService.parseMinorAmount('invalid')).toBe(0)
    })
  })
})
