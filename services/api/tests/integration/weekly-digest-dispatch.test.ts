import { runWeeklyDigestDispatchCron } from '../../src/queues/scheduler'
import { cleanTestDatabase, seedTestTeam, seedTestUser } from '../support/test-db'
import { notifyQueue } from '../../src/queues/queue.client'
import { prisma } from '../../src/db/client'

jest.mock('../../src/queues/queue.client', () => ({
  notifyQueue: {
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  },
}))

describe('Weekly Digest Dispatch Integration Tests', () => {
  beforeEach(async () => {
    await cleanTestDatabase()
    jest.clearAllMocks()
  })

  afterAll(async () => {
    await cleanTestDatabase()
  })

  it('enqueues WEEKLY_DIGEST jobs for teams on GROWTH, BUSINESS, and ENTERPRISE plans only', async () => {
    const growthTeam = await seedTestTeam({ plan: 'GROWTH' })
    const businessTeam = await seedTestTeam({ plan: 'BUSINESS' })
    const freeTeam = await seedTestTeam({ plan: 'FREE' })

    await seedTestUser(growthTeam.id)
    await seedTestUser(businessTeam.id)
    await seedTestUser(freeTeam.id)

    await runWeeklyDigestDispatchCron()

    expect(notifyQueue.add).toHaveBeenCalledTimes(2)
    expect(notifyQueue.add).toHaveBeenCalledWith('weekly-digest', {
      type: 'WEEKLY_DIGEST',
      teamId: growthTeam.id,
    })
    expect(notifyQueue.add).toHaveBeenCalledWith('weekly-digest', {
      type: 'WEEKLY_DIGEST',
      teamId: businessTeam.id,
    })
  })
})
