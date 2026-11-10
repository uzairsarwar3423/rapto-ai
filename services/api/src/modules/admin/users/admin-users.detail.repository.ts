import { prisma } from '../../../db/client'

/**
 * Read model for the detail endpoints.
 *
 * SECURITY: every query uses an explicit `select`. Nothing here ever selects passwordHash, totpSecretEnc, token
 * hashes, or integration credentials — they cannot leak into a response by accident because they are never read.
 */
export const adminUsersDetailRepository = {
  /** Soft-deleted users are "not found": accounts get deleted while a link is open in someone's tab. */
  findUser(id: string) {
    return prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerified: true,
        createdAt: true,
        lastActiveAt: true,
        lastLoginAt: true,
        timezone: true,
        avatarUrl: true,
        commitmentScore: true,
        team: { select: { id: true, name: true, slug: true, plan: true } },
        // At most one active suspension exists (partial unique index).
        suspensions: {
          where: { liftedAt: null },
          take: 1,
          select: { reason: true, suspendedAt: true, suspender: { select: { name: true } } },
        },
      },
    })
  },

  commitmentCountsByStatus(userId: string) {
    return prisma.commitment.groupBy({ by: ['status'], where: { ownerId: userId }, _count: { _all: true } })
  },

  /** Active (non-expired, non-revoked) sessions only; token hashes are never selected. */
  recentSessions(userId: string, limit = 5) {
    return prisma.refreshToken.findMany({
      where: { userId, expiresAt: { gt: new Date() }, reuseDetectedAt: null },
      orderBy: [{ lastUsedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: limit,
      select: { id: true, ipAddress: true, userAgent: true, lastUsedAt: true, createdAt: true },
    })
  },

  /** Staff actions that targeted this user (newest first). */
  staffActivity(userId: string, limit = 10) {
    return prisma.adminAuditLog.findMany({
      where: { targetType: 'user', targetId: userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, action: true, metadata: true, createdAt: true, adminUser: { select: { name: true } } },
    })
  },

  findTeam(id: string) {
    return prisma.team.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        plan: true,
        meetingsUsed: true,
        subscription: {
          select: {
            id: true,
            status: true,
            billingInterval: true,
            unitAmount: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
          },
        },
      },
    })
  },

  findTeamOwner(teamId: string) {
    return prisma.user.findFirst({
      where: { teamId, role: 'OWNER', deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, email: true },
    })
  },

  countTeamMembers(teamId: string) {
    return prisma.user.count({ where: { teamId, deletedAt: null } })
  },

  /** Provider NAMES of active integrations — `provider` is the only column selected (no tokens, no metadata). */
  async activeIntegrationProviders(teamId: string): Promise<string[]> {
    const rows = await prisma.teamIntegration.findMany({
      where: { teamId, isActive: true },
      orderBy: { provider: 'asc' },
      select: { provider: true },
    })
    return rows.map((r) => r.provider)
  },

  /**
   * Last snapshot of each month for one team, from Day 5's daily snapshots. A non-active month contributes 0 so a
   * cancelled team's MRR DROPS instead of carrying forward.
   */
  monthlyMrrSnapshots(teamId: string) {
    return prisma.$queryRaw<Array<{ monthStart: Date; mrrCents: number; snapshotDate: Date }>>`
      SELECT DISTINCT ON (date_trunc('month', "date"))
             date_trunc('month', "date")::date AS "monthStart",
             (CASE WHEN status = 'active' THEN "amountCents" ELSE 0 END)::int AS "mrrCents",
             "date" AS "snapshotDate"
      FROM subscription_daily_snapshots
      WHERE "teamId" = ${teamId} AND "date" >= (CURRENT_DATE - INTERVAL '12 months')
      ORDER BY date_trunc('month', "date"), "date" DESC`
  },

  /** Earliest snapshot captured from live state. Everything before it was reconstructed (approximate). */
  async firstLiveSnapshotDate(): Promise<Date | null> {
    const row = await prisma.subscriptionDailySnapshot.findFirst({
      where: { source: 'LIVE' },
      orderBy: { date: 'asc' },
      select: { date: true },
    })
    return row?.date ?? null
  },
}
