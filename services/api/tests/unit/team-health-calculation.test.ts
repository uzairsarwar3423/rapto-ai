import { calculateTeamHealthScore, invalidateHealthCache } from '../../src/modules/teams/team-health.service'
import { cleanTestDatabase, seedTestTeam, seedTestUser, seedTestMeeting, seedTestCommitment } from '../support/test-db'
import { prisma } from '../../src/db/client'
import { subDays } from 'date-fns'

describe('Team Health Score Calculation Unit Tests', () => {
  beforeEach(async () => {
    await cleanTestDatabase()
  })

  afterAll(async () => {
    await cleanTestDatabase()
  })

  it('returns default score (100) and stable trend for brand-new team with zero commitment history', async () => {
    const team = await seedTestTeam()
    await seedTestUser(team.id)

    const health = await calculateTeamHealthScore(team.id)

    expect(health.score).toBe(100)
    expect(health.fulfillmentRate).toBe(100)
    expect(health.onTimeRate).toBe(100)
    expect(health.trend).toBe('stable')
  })

  it('calculates weighted team health score (60% fulfillment + 30% avgMemberScore + 10% onTimeRate)', async () => {
    const team = await seedTestTeam()
    const user = await seedTestUser(team.id)
    const meeting = await seedTestMeeting(team.id)

    // Set user commitment score to 80
    await prisma.user.update({
      where: { id: user.id },
      data: { commitmentScore: 80 },
    })

    const now = new Date()
    const dueDate = subDays(now, 1)

    // 1 fulfilled on-time, 1 missed => 50% fulfillment rate, 100% on-time rate for fulfilled
    await seedTestCommitment(team.id, user.id, meeting.id, {
      status: 'FULFILLED',
      dueDate,
      resolvedAt: dueDate,
    })
    await seedTestCommitment(team.id, user.id, meeting.id, {
      status: 'MISSED',
      dueDate,
    })

    await invalidateHealthCache(team.id)
    const health = await calculateTeamHealthScore(team.id)

    // fulfillmentRate = 50, avgMemberScore = 80, onTimeRate = 100
    // Expected score = Math.round(50 * 0.6 + 80 * 0.3 + 100 * 0.1) = 30 + 24 + 10 = 64
    expect(health.fulfillmentRate).toBe(50)
    expect(health.avgMemberScore).toBe(80)
    expect(health.onTimeRate).toBe(100)
    expect(health.score).toBe(64)
  })

  it('computes 14-day trend comparing recent 14 days vs prior 14 days', async () => {
    const team = await seedTestTeam()
    const user = await seedTestUser(team.id)
    const meeting = await seedTestMeeting(team.id)

    const now = new Date()
    const recent = subDays(now, 5)
    const prior = subDays(now, 20)

    // Prior 14-day window: 0% fulfilled
    await seedTestCommitment(team.id, user.id, meeting.id, {
      status: 'MISSED',
      createdAt: prior,
    })

    // Recent 14-day window: 100% fulfilled
    await seedTestCommitment(team.id, user.id, meeting.id, {
      status: 'FULFILLED',
      createdAt: recent,
    })

    await invalidateHealthCache(team.id)
    const health = await calculateTeamHealthScore(team.id)

    expect(health.trend).toBe('improving')
  })
})
