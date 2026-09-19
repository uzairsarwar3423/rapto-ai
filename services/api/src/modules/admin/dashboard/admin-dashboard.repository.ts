import { prisma } from '../../../db/client'

export const adminDashboardRepository = {
  async findMetricsInRange(from: string, to: string) {
    const fromDate = new Date(from + 'T00:00:00.000Z')
    const toDate = new Date(to + 'T23:59:59.999Z')

    // 1. Check if platformMetricsDaily has rolled-up records
    const existing = await prisma.platformMetricsDaily.findMany({
      where: {
        date: {
          gte: fromDate,
          lte: toDate,
        },
      },
      orderBy: { date: 'asc' },
    })

    if (existing.length > 0) {
      return existing
    }

    // 2. Real-time dynamic calculation directly from subscriptions, teams, and users tables
    const [subs, teams, totalUsersCount] = await Promise.all([
      prisma.subscription.findMany({
        where: {
          status: { in: ['active', 'trialing'] },
        },
      }),
      prisma.team.findMany({
        where: {
          createdAt: { lte: toDate },
        },
      }),
      prisma.user.count(),
    ])

    const points = []
    const curr = new Date(fromDate)
    let cumulativeRevenue = 0

    while (curr <= toDate) {
      const dayStr = curr.toISOString().slice(0, 10)
      const dayEnd = new Date(dayStr + 'T23:59:59.999Z')

      const activeOnDay = subs.filter((s) => new Date(s.createdAt) <= dayEnd)
      const mrr = activeOnDay.reduce((acc, s) => acc + (s.unitAmount || 0), 0)

      const newSubsOnDay = subs.filter((s) => s.createdAt.toISOString().slice(0, 10) === dayStr)
      const newMrr = newSubsOnDay.reduce((acc, s) => acc + (s.unitAmount || 0), 0)

      const newTeamsOnDay = teams.filter(
        (t) => t.createdAt.toISOString().slice(0, 10) === dayStr
      ).length
      const activeSubsCount = activeOnDay.length
      const arpu = activeSubsCount > 0 ? Math.round(mrr / activeSubsCount) : 0

      // Daily recognized revenue accumulation based strictly on active subscriptions
      cumulativeRevenue += Math.round(mrr / 30)

      points.push({
        date: new Date(dayStr + 'T00:00:00.000Z'),
        totalRevenueCents: BigInt(cumulativeRevenue),
        mrrCents: BigInt(mrr),
        arrCents: BigInt(mrr * 12),
        newMrrCents: BigInt(newMrr),
        expansionMrrCents: BigInt(0),
        contractionMrrCents: BigInt(0),
        churnedMrrCents: BigInt(0),
        activeSubscriptions: activeSubsCount,
        newTeams: newTeamsOnDay,
        churnedTeams: 0,
        totalTeams: teams.filter((t) => new Date(t.createdAt) <= dayEnd).length,
        totalUsers: totalUsersCount,
        arpuCents: arpu,
        logoChurnRate: 0,
        revenueChurnRate: 0,
        computedAt: new Date(),
      })

      curr.setDate(curr.getDate() + 1)
    }

    return points
  },

  async findMetricAt(date: string) {
    const targetDate = new Date(date + 'T23:59:59.999Z')

    const row = await prisma.platformMetricsDaily.findFirst({
      where: {
        date: {
          lte: targetDate,
        },
      },
      orderBy: { date: 'desc' },
    })

    if (row) return row

    // Dynamically calculate snapshot from subscriptions, teams, and users tables
    const [subs, teamCount, userCount] = await Promise.all([
      prisma.subscription.findMany({
        where: {
          status: { in: ['active', 'trialing'] },
          createdAt: { lte: targetDate },
        },
      }),
      prisma.team.count({
        where: { createdAt: { lte: targetDate } },
      }),
      prisma.user.count({
        where: { createdAt: { lte: targetDate } },
      }),
    ])

    const mrr = subs.reduce((acc, s) => acc + (s.unitAmount || 0), 0)
    const activeCount = subs.length
    const arpu = activeCount > 0 ? Math.round(mrr / activeCount) : 0

    return {
      date: targetDate,
      totalRevenueCents: BigInt(mrr),
      mrrCents: BigInt(mrr),
      arrCents: BigInt(mrr * 12),
      newMrrCents: BigInt(0),
      expansionMrrCents: BigInt(0),
      contractionMrrCents: BigInt(0),
      churnedMrrCents: BigInt(0),
      activeSubscriptions: activeCount,
      newTeams: 0,
      churnedTeams: 0,
      totalTeams: teamCount,
      totalUsers: userCount,
      arpuCents: arpu,
      logoChurnRate: 0,
      revenueChurnRate: 0,
      computedAt: new Date(),
    }
  },

  async findTopTeamsByMrr(limit: number) {
    // Queries real subscriptions and joined teams directly from the database
    const subs = await prisma.subscription.findMany({
      where: {
        status: { in: ['active', 'trialing'] },
      },
      include: {
        team: true,
      },
      orderBy: {
        unitAmount: 'desc',
      },
      take: limit,
    })

    return subs.map((s) => ({
      teamId: s.teamId,
      teamName: s.team?.name || 'Unknown Team',
      mrrCents: s.unitAmount || 0,
      plan: s.plan,
    }))
  },

  async findPlanMix(at?: string) {
    // Queries real subscriptions directly from the database grouped by plan
    const targetDate = at ? new Date(at + 'T23:59:59.999Z') : new Date()
    const groups = await prisma.subscription.groupBy({
      by: ['plan'],
      where: {
        status: { in: ['active', 'trialing'] },
        createdAt: { lte: targetDate },
      },
      _sum: {
        unitAmount: true,
      },
    })

    return groups.map((g) => ({
      plan: g.plan,
      totalCents: g._sum.unitAmount || 0,
    }))
  },

  async findLiveSubscriptionTotals() {
    const activeSubs = await prisma.subscription.findMany({
      where: { status: { in: ['active', 'trialing'] } },
    })
    const totalMrr = activeSubs.reduce((sum, s) => sum + (s.unitAmount || 0), 0)
    const activeCount = activeSubs.length
    const arpu = activeCount > 0 ? Math.round(totalMrr / activeCount) : 0
    return {
      totalMrr,
      activeCount,
      arpu,
    }
  },

  findCohortRetention(sinceMonthsAgo: number) {
    const since = new Date()
    since.setMonth(since.getMonth() - sinceMonthsAgo)
    since.setDate(1)
    since.setHours(0, 0, 0, 0)

    return prisma.cohortRetentionSnapshot.findMany({
      where: { cohortMonth: { gte: since } },
      orderBy: [{ cohortMonth: 'asc' }, { periodIndex: 'asc' }],
    })
  },
}
