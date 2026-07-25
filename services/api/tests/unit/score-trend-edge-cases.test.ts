import { calculateScoreTrend } from '../../src/services/score.service'
import { cleanTestDatabase, seedTestTeam, seedTestUser, seedTestMeeting, seedTestCommitment } from '../support/test-db'
import { subDays } from 'date-fns'

describe('Commitment Score Trend Sub-Algorithm Unit Tests', () => {
  beforeEach(async () => {
    await cleanTestDatabase()
  })

  afterAll(async () => {
    await cleanTestDatabase()
  })

  it('returns stable when zero decided commitments in either comparison window', async () => {
    const team = await seedTestTeam()
    const user = await seedTestUser(team.id)

    const trend = await calculateScoreTrend(user.id, team.id)
    expect(trend).toBe('stable')
  })

  it('returns stable when all commitments in lookback period are PENDING', async () => {
    const team = await seedTestTeam()
    const user = await seedTestUser(team.id)
    const meeting = await seedTestMeeting(team.id)

    await seedTestCommitment(team.id, user.id, meeting.id, {
      status: 'PENDING',
      createdAt: subDays(new Date(), 2),
    })

    const trend = await calculateScoreTrend(user.id, team.id)
    expect(trend).toBe('stable')
  })

  it('returns improving when current week rate is >5 points higher than prior week rate', async () => {
    const team = await seedTestTeam()
    const user = await seedTestUser(team.id)
    const meeting = await seedTestMeeting(team.id)

    const now = new Date()
    const thisWeek = subDays(now, 3)
    const priorWeek = subDays(now, 10)

    // Prior week: 0% fulfilled (1 missed)
    await seedTestCommitment(team.id, user.id, meeting.id, {
      status: 'MISSED',
      createdAt: priorWeek,
    })

    // Current week: 100% fulfilled (1 fulfilled)
    await seedTestCommitment(team.id, user.id, meeting.id, {
      status: 'FULFILLED',
      createdAt: thisWeek,
    })

    const trend = await calculateScoreTrend(user.id, team.id)
    expect(trend).toBe('improving')
  })

  it('returns declining when current week rate is >5 points lower than prior week rate', async () => {
    const team = await seedTestTeam()
    const user = await seedTestUser(team.id)
    const meeting = await seedTestMeeting(team.id)

    const now = new Date()
    const thisWeek = subDays(now, 3)
    const priorWeek = subDays(now, 10)

    // Prior week: 100% fulfilled
    await seedTestCommitment(team.id, user.id, meeting.id, {
      status: 'FULFILLED',
      createdAt: priorWeek,
    })

    // Current week: 0% fulfilled
    await seedTestCommitment(team.id, user.id, meeting.id, {
      status: 'MISSED',
      createdAt: thisWeek,
    })

    const trend = await calculateScoreTrend(user.id, team.id)
    expect(trend).toBe('declining')
  })
})
