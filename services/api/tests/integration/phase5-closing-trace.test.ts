import { cleanTestDatabase, seedTestTeam, seedTestUser, seedTestMeeting, seedTestCommitment } from '../support/test-db'
import { calculateCommitmentScore, persistScore } from '../../src/services/score.service'
import { calculateTeamHealthScore, buildWeeklyDigestData } from '../../src/modules/teams/team-health.service'
import { runWeeklyScoreSnapshotCron } from '../../src/queues/scheduler'
import { prisma } from '../../src/db/client'
import { startOfWeek } from 'date-fns'

describe('Phase 5 Capstone Closing Trace Test', () => {
  beforeEach(async () => {
    await cleanTestDatabase()
  })

  afterAll(async () => {
    await cleanTestDatabase()
  })

  it('completes full lifecycle trace from commitment resolution to score update, team health, snapshot, and digest assembly', async () => {
    // 1. Setup Team & Members
    const team = await seedTestTeam({ name: 'Engineering Core', plan: 'GROWTH' })
    const manager = await seedTestUser(team.id, { role: 'MANAGER', name: 'Carol Manager' })
    const dev = await seedTestUser(team.id, { role: 'MEMBER', name: 'Dave Dev' })
    const meeting = await seedTestMeeting(team.id)

    // 2. Dev fulfills a commitment
    const commitment = await seedTestCommitment(team.id, dev.id, meeting.id, {
      text: 'Deploy Microservice v2',
      status: 'FULFILLED',
      dueDate: new Date(),
      resolvedAt: new Date(),
    })

    // 3. Score calculation & persistence
    const scoreResult = await calculateCommitmentScore(dev.id, team.id)
    expect(scoreResult.score).toBe(100)
    await persistScore(dev.id, team.id, scoreResult, 'manual_status_change')

    const updatedUser = await prisma.user.findUnique({ where: { id: dev.id } })
    expect(updatedUser?.commitmentScore).toBe(100)

    // 4. Team Health Score
    const teamHealth = await calculateTeamHealthScore(team.id)
    expect(teamHealth.score).toBe(100)
    expect(teamHealth.fulfillmentRate).toBe(100)

    // 5. Sunday Snapshot Cron
    await runWeeklyScoreSnapshotCron()

    const now = new Date()
    const weekStart = startOfWeek(now, { weekStartsOn: 1 })
    const snapshot = await prisma.commitmentScoreSnapshot.findFirst({
      where: { userId: dev.id },
    })
    expect(snapshot).not.toBeNull()
    expect(snapshot?.commitmentScore).toBe(100)

    // 6. Monday Digest Assembly
    const digestData = await buildWeeklyDigestData(team.id)
    expect(digestData.teamName).toBe('Engineering Core')
    expect(digestData.healthScore).toBe(100)
    expect(digestData.fulfilledCount).toBe(1)
  })
})
