import { notificationsService } from '../../src/modules/notifications/notifications.service'
import { prisma } from '../../src/db/client'

describe('Manager Fan-Out Recipient Resolution', () => {
  const team1Id = 'team-fanout-1'
  const team2Id = 'team-fanout-2'

  beforeAll(async () => {
    // Cleanup any pre-existing test data
    await prisma.notificationPreference.deleteMany({
      where: { userId: { in: ['u-owner-1', 'u-admin-1', 'u-mgr-1', 'u-mem-1', 'u-other-team'] } }
    }).catch(() => {})
    await prisma.user.deleteMany({
      where: { id: { in: ['u-owner-1', 'u-admin-1', 'u-mgr-1', 'u-mem-1', 'u-other-team'] } }
    }).catch(() => {})
    await prisma.team.deleteMany({
      where: { id: { in: [team1Id, team2Id] } }
    }).catch(() => {})

    // Seed test teams and users
    await prisma.team.createMany({
      data: [
        { id: team1Id, name: 'Team One', slug: 'team-one-fanout' },
        { id: team2Id, name: 'Team Two', slug: 'team-two-fanout' },
      ],
    })

    await prisma.user.createMany({
      data: [
        { id: 'u-owner-1', email: 'owner1@test.com', name: 'Owner 1', teamId: team1Id, role: 'OWNER' },
        { id: 'u-admin-1', email: 'admin1@test.com', name: 'Admin 1', teamId: team1Id, role: 'ADMIN' },
        { id: 'u-mgr-1', email: 'mgr1@test.com', name: 'Mgr 1', teamId: team1Id, role: 'MANAGER' },
        { id: 'u-mem-1', email: 'mem1@test.com', name: 'Member 1', teamId: team1Id, role: 'MEMBER' },
        { id: 'u-other-team', email: 'other@test.com', name: 'Other Manager', teamId: team2Id, role: 'MANAGER' },
      ],
    })
  })

  afterAll(async () => {
    await prisma.notificationPreference.deleteMany({
      where: { userId: { in: ['u-owner-1', 'u-admin-1', 'u-mgr-1', 'u-mem-1', 'u-other-team'] } }
    }).catch(() => {})
    await prisma.user.deleteMany({
      where: { id: { in: ['u-owner-1', 'u-admin-1', 'u-mgr-1', 'u-mem-1', 'u-other-team'] } }
    }).catch(() => {})
    await prisma.team.deleteMany({
      where: { id: { in: [team1Id, team2Id] } }
    }).catch(() => {})
  })

  it('correctly resolves OWNER, ADMIN, and MANAGER role holders, excluding MEMBERs', async () => {
    const managers = await notificationsService.getManagersToNotify(team1Id)
    const managerIds = managers.map((m) => m.id)

    expect(managerIds).toContain('u-owner-1')
    expect(managerIds).toContain('u-admin-1')
    expect(managerIds).toContain('u-mgr-1')
    expect(managerIds).not.toContain('u-mem-1')
  })

  it('enforces strict tenant isolation — never returns managers from another team', async () => {
    const managers = await notificationsService.getManagersToNotify(team1Id)
    const managerIds = managers.map((m) => m.id)

    expect(managerIds).not.toContain('u-other-team')
  })

  it('evaluates user preference checks correctly for disabled manager notification', async () => {
    // Disable commitmentMissed for u-mgr-1
    await notificationsService.updatePreferences('u-mgr-1', {
      slack: { commitmentMissed: false },
    })

    const mgr1Allowed = await notificationsService.shouldSendSlack('u-mgr-1', 'COMMITMENT_MISSED')
    const admin1Allowed = await notificationsService.shouldSendSlack('u-admin-1', 'COMMITMENT_MISSED')

    expect(mgr1Allowed).toBe(false)
    expect(admin1Allowed).toBe(true)
  })
})
