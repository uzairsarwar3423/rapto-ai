import { calculateCommitmentScore } from '../../src/services/score.service'
import { cleanTestDatabase, seedTestTeam, seedTestUser, seedTestMeeting, seedTestCommitment } from '../support/test-db'
import { subDays } from 'date-fns'

describe('Commitment Score Calculation Unit Tests', () => {
  beforeEach(async () => {
    await cleanTestDatabase()
  })

  afterAll(async () => {
    await cleanTestDatabase()
  })

  it('returns default 100 benefit-of-the-doubt score for zero commitments without NaN', async () => {
    const team = await seedTestTeam()
    const user = await seedTestUser(team.id)

    const result = await calculateCommitmentScore(user.id, team.id)

    expect(result).toEqual({
      score: 100,
      fulfillmentRate: 100,
      onTimeRate: 100,
      trend: 'stable',
      total: 0,
      fulfilled: 0,
      missed: 0,
      pending: 0,
    })
  })

  it('calculates perfect 100 score for a user with all commitments fulfilled on time', async () => {
    const team = await seedTestTeam()
    const user = await seedTestUser(team.id)
    const meeting = await seedTestMeeting(team.id)

    const dueDate = new Date()
    const resolvedAt = subDays(dueDate, 1)

    await seedTestCommitment(team.id, user.id, meeting.id, {
      status: 'FULFILLED',
      dueDate,
      resolvedAt,
    })
    await seedTestCommitment(team.id, user.id, meeting.id, {
      status: 'FULFILLED',
      dueDate,
      resolvedAt,
    })

    const result = await calculateCommitmentScore(user.id, team.id)

    expect(result.score).toBe(100)
    expect(result.fulfillmentRate).toBe(100)
    expect(result.onTimeRate).toBe(100)
    expect(result.fulfilled).toBe(2)
    expect(result.missed).toBe(0)
  })

  it('calculates 0 score for a user with every decided commitment missed', async () => {
    const team = await seedTestTeam()
    const user = await seedTestUser(team.id)
    const meeting = await seedTestMeeting(team.id)

    await seedTestCommitment(team.id, user.id, meeting.id, {
      status: 'MISSED',
    })
    await seedTestCommitment(team.id, user.id, meeting.id, {
      status: 'MISSED',
    })

    const result = await calculateCommitmentScore(user.id, team.id)

    expect(result.score).toBe(0)
    expect(result.fulfillmentRate).toBe(0)
    expect(result.fulfilled).toBe(0)
    expect(result.missed).toBe(2)
  })

  it('weights recent commitments (last 7 days) more heavily than older commitments (7-30 days)', async () => {
    const team = await seedTestTeam()
    const userHighRecent = await seedTestUser(team.id)
    const userLowRecent = await seedTestUser(team.id)
    const meeting = await seedTestMeeting(team.id)

    const now = new Date()
    const recentDate = subDays(now, 2)
    const olderDate = subDays(now, 15)

    // User A: Poor past (older missed), strong recent (recent fulfilled)
    await seedTestCommitment(team.id, userHighRecent.id, meeting.id, {
      status: 'MISSED',
      createdAt: olderDate,
    })
    await seedTestCommitment(team.id, userHighRecent.id, meeting.id, {
      status: 'FULFILLED',
      createdAt: recentDate,
      dueDate: now,
      resolvedAt: recentDate,
    })

    // User B: Strong past (older fulfilled), poor recent (recent missed)
    await seedTestCommitment(team.id, userLowRecent.id, meeting.id, {
      status: 'FULFILLED',
      createdAt: olderDate,
      dueDate: now,
      resolvedAt: olderDate,
    })
    await seedTestCommitment(team.id, userLowRecent.id, meeting.id, {
      status: 'MISSED',
      createdAt: recentDate,
    })

    const resA = await calculateCommitmentScore(userHighRecent.id, team.id)
    const resB = await calculateCommitmentScore(userLowRecent.id, team.id)

    expect(resA.score).toBeGreaterThan(resB.score)
  })

  it('clamps final score to [0, 100]', async () => {
    const team = await seedTestTeam()
    const user = await seedTestUser(team.id)
    const meeting = await seedTestMeeting(team.id)

    const dueDate = new Date()
    const resolvedAt = subDays(dueDate, 1)

    // Perfect weighted rate (100) + 10 point on-time bonus = 110 -> clamped to 100
    await seedTestCommitment(team.id, user.id, meeting.id, {
      status: 'FULFILLED',
      dueDate,
      resolvedAt,
    })

    const result = await calculateCommitmentScore(user.id, team.id)
    expect(result.score).toBeLessThanOrEqual(100)
    expect(result.score).toBeGreaterThanOrEqual(0)
  })
})
