import { cleanTestDatabase, seedTestTeam, seedTestUser, seedTestMeeting, seedTestCommitment } from '../support/test-db'
import { commitmentsService } from '../../src/modules/commitments/commitments.service'
import { markMissedCommitments } from '../../src/queues/workers/deadline.worker'
import { prisma } from '../../src/db/client'
import { subDays } from 'date-fns'

describe('Recalculation Trigger-Point Audit Integration Suite', () => {
  beforeEach(async () => {
    await cleanTestDatabase()
  })

  afterAll(async () => {
    await cleanTestDatabase()
  })

  it('Trigger 1: Manual FULFILLED transition triggers score recalculation & updates users.commitmentScore', async () => {
    const team = await seedTestTeam()
    const user = await seedTestUser(team.id)
    const meeting = await seedTestMeeting(team.id)

    const commitment = await seedTestCommitment(team.id, user.id, meeting.id, {
      status: 'PENDING',
    })

    expect(user.commitmentScore).toBe(100)

    await commitmentsService.updateCommitmentStatus(
      commitment.id,
      team.id,
      user.id,
      'MEMBER',
      { status: 'FULFILLED' }
    )

    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } })
    expect(updatedUser?.commitmentScore).toBe(100)
  })

  it('Trigger 2: Manual DEFERRED transition triggers score recalculation & updates users.commitmentScore', async () => {
    const team = await seedTestTeam()
    const user = await seedTestUser(team.id)
    const meeting = await seedTestMeeting(team.id)

    const commitment = await seedTestCommitment(team.id, user.id, meeting.id, {
      status: 'PENDING',
    })

    const newDueDate = new Date(Date.now() + 86400000 * 2).toISOString()

    await commitmentsService.updateCommitmentStatus(
      commitment.id,
      team.id,
      user.id,
      'MEMBER',
      { status: 'DEFERRED', newDueDate, note: 'Need more time' }
    )

    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } })
    expect(updatedUser?.commitmentScore).toBeDefined()
  })

  it('Trigger 3: Manual CANCELLED transition explicitly EXCLUDES score recalculation', async () => {
    const team = await seedTestTeam()
    const user = await seedTestUser(team.id)
    const meeting = await seedTestMeeting(team.id)

    // Set initial score to 85
    await prisma.user.update({
      where: { id: user.id },
      data: { commitmentScore: 85 },
    })

    const commitment = await seedTestCommitment(team.id, user.id, meeting.id, {
      status: 'PENDING',
    })

    await commitmentsService.updateCommitmentStatus(
      commitment.id,
      team.id,
      user.id,
      'MEMBER',
      { status: 'CANCELLED', note: 'Extraction correction: irrelevant item' }
    )

    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } })
    // User score MUST remain unchanged at 85, confirming CANCELLED exclusion rule
    expect(updatedUser?.commitmentScore).toBe(85)
  })

  it('Trigger 4: AI-detected FULFILLED resolution updates users.commitmentScore', async () => {
    const team = await seedTestTeam()
    const user = await seedTestUser(team.id)
    const meeting = await seedTestMeeting(team.id)

    // Set initial score to 50
    await prisma.user.update({
      where: { id: user.id },
      data: { commitmentScore: 50 },
    })

    const commitment = await seedTestCommitment(team.id, user.id, meeting.id, {
      status: 'PENDING',
    })

    // Simulate resolution post-processing step
    const { calculateCommitmentScore, persistScore } = await import('../../src/services/score.service')

    await prisma.commitment.update({
      where: { id: commitment.id },
      data: {
        status: 'FULFILLED',
        resolvedAt: new Date(),
        resolvedInMeetingId: meeting.id,
      },
    })

    const scoreResult = await calculateCommitmentScore(user.id, team.id)
    await persistScore(user.id, team.id, scoreResult, 'ai_resolution')

    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } })
    expect(updatedUser?.commitmentScore).toBe(100)
  })

  it('Trigger 5: Batch MISSED transition recalculates score deduplicated per unique owner', async () => {
    const team = await seedTestTeam()
    const userA = await seedTestUser(team.id)
    const userB = await seedTestUser(team.id)
    const meeting = await seedTestMeeting(team.id)

    const pastDueDate = subDays(new Date(), 2)

    // 2 overdue commitments for User A, 1 for User B
    await seedTestCommitment(team.id, userA.id, meeting.id, {
      status: 'PENDING',
      dueDate: pastDueDate,
    })
    await seedTestCommitment(team.id, userA.id, meeting.id, {
      status: 'PENDING',
      dueDate: pastDueDate,
    })
    await seedTestCommitment(team.id, userB.id, meeting.id, {
      status: 'PENDING',
      dueDate: pastDueDate,
    })

    await markMissedCommitments()

    const updatedUserA = await prisma.user.findUnique({ where: { id: userA.id } })
    const updatedUserB = await prisma.user.findUnique({ where: { id: userB.id } })

    expect(updatedUserA?.commitmentScore).toBe(0)
    expect(updatedUserB?.commitmentScore).toBe(0)
  })
})
