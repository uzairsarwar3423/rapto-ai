jest.mock('bullmq', () => {
  return {
    Queue: jest.fn().mockImplementation(() => ({
      add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
      close: jest.fn().mockResolvedValue(undefined),
    })),
    Worker: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    })),
    QueueEvents: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    })),
  }
})

jest.mock('../../src/config/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}))

import { runBillingCycleResetCron } from '../../src/queues/scheduler'
import { prisma } from '../../src/db/client'
import { invalidatePlanCache } from '../../src/middleware/plan-limits.middleware'

jest.mock('../../src/db/client', () => ({
  prisma: {
    team: {
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    subscription: {
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  },
}))

jest.mock('../../src/middleware/plan-limits.middleware', () => ({
  invalidatePlanCache: jest.fn().mockResolvedValue(undefined),
}))

describe('scheduler — runBillingCycleResetCron', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('resets meetingsUsed for Free tier teams whose cycle has completed', async () => {
    ;(prisma.team.findMany as jest.Mock)
      .mockResolvedValueOnce([{ id: 'team_free_1' }, { id: 'team_free_2' }]) // Free teams

    await runBillingCycleResetCron()

    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { id: 'team_free_1' },
      data: expect.objectContaining({
        meetingsUsed: 0,
        billingCycleStart: expect.any(Date),
        billingCycleEnd: expect.any(Date),
      }),
    })

    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { id: 'team_free_2' },
      data: expect.objectContaining({
        meetingsUsed: 0,
      }),
    })

    expect(invalidatePlanCache).toHaveBeenCalledWith('team_free_1')
    expect(invalidatePlanCache).toHaveBeenCalledWith('team_free_2')
  })

  it('no longer mutates paid plans or subscriptions: grace / cancellation / trial expiry are owned by runEntitlementSync (see billing-payment-lifecycle.db.test.ts)', async () => {
    ;(prisma.team.findMany as jest.Mock).mockResolvedValue([])

    await runBillingCycleResetCron()

    expect(prisma.subscription.findMany).not.toHaveBeenCalled()
    expect(prisma.subscription.update).not.toHaveBeenCalled()
    expect(prisma.team.update).not.toHaveBeenCalled()
  })
})
