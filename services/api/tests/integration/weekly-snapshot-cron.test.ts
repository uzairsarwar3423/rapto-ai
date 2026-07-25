import { cleanTestDatabase, seedTestTeam, seedTestUser, seedTestMeeting, seedTestCommitment } from '../support/test-db'
import { runWeeklyScoreSnapshotCron } from '../../src/queues/scheduler'
import { prisma } from '../../src/db/client'
import { subDays, startOfWeek, getISOWeek, getISOWeekYear } from 'date-fns'

describe('Weekly Snapshot Cron Integration Tests', () => {
  beforeEach(async () => {
    await cleanTestDatabase()
  })

  afterAll(async () => {
    await cleanTestDatabase()
  })

  it('populates commitment_score_snapshots for all active members and syncs users.commitmentScore', async () => {
    const team = await seedTestTeam()
    const userA = await seedTestUser(team.id)
    const userB = await seedTestUser(team.id)
    const meeting = await seedTestMeeting(team.id)

    // User A: 1 FULFILLED commitment
    await seedTestCommitment(team.id, userA.id, meeting.id, {
      status: 'FULFILLED',
      dueDate,
      resolvedAt: dueDate,
    })

    // User B: 1 MISSED commitment
    await seedTestCommitment(team.id, userB.id, meeting.id, {
      status: 'MISSED',
      dueDate,
    })

    await runWeeklyScoreSnapshotCron()

    const nowRef = new Date()
    const weekStart = startOfWeek(nowRef, { weekStartsOn: 1 })

    const snapshots = await prisma.commitmentScoreSnapshot.findMany({
      where: { teamId: team.id },
    })

    expect(snapshots.length).toBe(2)

    const snapshotA = snapshots.find((s) => s.userId === userA.id)
    const snapshotB = snapshots.find((s) => s.userId === userB.id)

    expect(snapshotA).toBeDefined()
    expect(snapshotA?.commitmentScore).toBe(100)
    expect(snapshotA?.fulfillmentRate).toBe(100)

    expect(snapshotB).toBeDefined()
    expect(snapshotB?.commitmentScore).toBe(0)
    expect(snapshotB?.fulfillmentRate).toBe(0)

    const dbUserA = await prisma.user.findUnique({ where: { id: userA.id } })
    const dbUserB = await prisma.user.findUnique({ where: { id: userB.id } })

    expect(dbUserA?.commitmentScore).toBe(100)
    expect(dbUserB?.commitmentScore).toBe(0)
  })

  it('is idempotent when re-run for the same week (updates existing snapshot, no duplicate key error)', async () => {
    const team = await seedTestTeam()
    const user = await seedTestUser(team.id)
    const meeting = await seedTestMeeting(team.id)

    await seedTestCommitment(team.id, user.id, meeting.id, {
      status: 'FULFILLED',
    })

    // Run 1
    await runWeeklyScoreSnapshotCron()

    let snapshots = await prisma.commitmentScoreSnapshot.findMany({
      where: { userId: user.id },
    })
    expect(snapshots.length).toBe(1)

    // Run 2 (accidental double trigger)
    await runWeeklyScoreSnapshotCron()

    snapshots = await prisma.commitmentScoreSnapshot.findMany({
      where: { userId: user.id },
    })
    expect(snapshots.length).toBe(1)
  })
})
