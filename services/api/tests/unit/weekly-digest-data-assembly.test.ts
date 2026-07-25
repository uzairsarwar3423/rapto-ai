import { buildWeeklyDigestData } from '../../src/modules/teams/team-health.service'
import { cleanTestDatabase, seedTestTeam, seedTestUser, seedTestMeeting, seedTestCommitment } from '../support/test-db'
import { prisma } from '../../src/db/client'
import { startOfWeek, subDays, addDays } from 'date-fns'

describe('Weekly Digest Data Assembly Unit Tests', () => {
  beforeEach(async () => {
    await cleanTestDatabase()
  })

  afterAll(async () => {
    await cleanTestDatabase()
  })

  it('assembles weekly digest payload including team health, snapshots deltas, and upcoming deadlines', async () => {
    const team = await seedTestTeam({ name: 'Alpha Squad' })
    const userA = await seedTestUser(team.id, { name: 'Alice' })
    const userB = await seedTestUser(team.id, { name: 'Bob' })
    const meeting = await seedTestMeeting(team.id)

    const now = new Date()
    const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 })
    const lastWeekStart = subDays(thisWeekStart, 7)

    // Seed snapshots for Alice (improved +15) and Bob (declined -10)
    await prisma.commitmentScoreSnapshot.createMany({
      data: [
        { userId: userA.id, teamId: team.id, weekStart: lastWeekStart, isoWeek: '2026-W01', commitmentScore: 70, fulfillmentRate: 100, onTimeRate: 100 },
        { userId: userA.id, teamId: team.id, weekStart: thisWeekStart, isoWeek: '2026-W02', commitmentScore: 85, fulfillmentRate: 100, onTimeRate: 100 },
        { userId: userB.id, teamId: team.id, weekStart: lastWeekStart, isoWeek: '2026-W01', commitmentScore: 90, fulfillmentRate: 100, onTimeRate: 100 },
        { userId: userB.id, teamId: team.id, weekStart: thisWeekStart, isoWeek: '2026-W02', commitmentScore: 80, fulfillmentRate: 100, onTimeRate: 100 },
      ],
    })

    // Seed trailing 7-day commitments (1 FULFILLED, 1 MISSED)
    await seedTestCommitment(team.id, userA.id, meeting.id, { status: 'FULFILLED' })
    await seedTestCommitment(team.id, userB.id, meeting.id, { status: 'MISSED' })

    // Seed upcoming deadline (PENDING due in 3 days)
    const upcomingDueDate = addDays(now, 3)
    await seedTestCommitment(team.id, userA.id, meeting.id, {
      text: 'Finalize Q3 Roadmap',
      status: 'PENDING',
      dueDate: upcomingDueDate,
    })

    const digest = await buildWeeklyDigestData(team.id)

    expect(digest.teamName).toBe('Alpha Squad')
    expect(digest.healthScore).toBeGreaterThanOrEqual(0)
    expect(digest.fulfilledCount).toBe(1)
    expect(digest.missedCount).toBe(1)

    expect(digest.mostImproved.length).toBe(1)
    expect(digest.mostImproved[0].name).toBe('Alice')
    expect(digest.mostImproved[0].change).toBe(15)

    expect(digest.mostDeclined.length).toBe(1)
    expect(digest.mostDeclined[0].name).toBe('Bob')
    expect(digest.mostDeclined[0].change).toBe(-10)

    expect(digest.upcomingDeadlines.length).toBe(1)
    expect(digest.upcomingDeadlines[0].text).toBe('Finalize Q3 Roadmap')
    expect(digest.upcomingDeadlines[0].ownerName).toBe('Alice')
  })
})
