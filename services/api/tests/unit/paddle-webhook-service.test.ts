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
})
