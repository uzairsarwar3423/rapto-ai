import { AppError } from '../../../utils/errors'
import { PLAN_LIMITS } from '../../../config/plans.config'
import { teamHealthService } from '../../teams/team-health.service'
import { isolate } from '../shared/isolate'
import { adminUsersDetailRepository as repo } from './admin-users.detail.repository'
import type { UserStatus } from './admin-users.repository'
import type { AdminTeamDetail, AdminUserDetail } from './admin-users.detail.types'

// Ids are cuids. Anything that is not a plausible id is simply "not found" — never a 400/500 (and it never reaches SQL
// as a pathological value).
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

export const userNotFound = () => new AppError('USER_NOT_FOUND', 404, 'This user no longer exists')
export const teamNotFound = () => new AppError('TEAM_NOT_FOUND', 404, 'This team no longer exists')

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

/** Same derivation as the list endpoint's SQL (CASE expression): suspension wins over verification. */
export function deriveUserStatus(hasActiveSuspension: boolean, emailVerified: boolean): UserStatus {
  if (hasActiveSuspension) return 'SUSPENDED'
  return emailVerified ? 'ACTIVE' : 'UNVERIFIED'
}

/** Monthly-normalized MRR of a subscription; 0 unless it is actively paying (matches the platform MRR definition). */
export function subscriptionMrrCents(status: string, amountCents: number, interval: 'month' | 'year'): number {
  if (status !== 'active') return 0
  return interval === 'year' ? Math.round(amountCents / 12) : amountCents
}

/** -1 in plans.config means unlimited → null in the API. */
const limitOrNull = (n: number | undefined) => (n === undefined || n < 0 ? null : n)

const toDay = (d: Date) => d.toISOString().slice(0, 10)

/** Pure: shape the monthly snapshot rows and decide whether the "history is reconstructed" footnote applies. */
export function shapeMrrHistory(
  rows: Array<{ monthStart: Date; mrrCents: number }>,
  firstLiveSnapshot: Date | null,
): { points: AdminTeamDetail['mrrHistory']; reconstructedBefore: string | null } {
  const points = rows
    .map((r) => ({ date: toDay(r.monthStart), mrrCents: r.mrrCents }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-12)

  // Every point predates the first LIVE snapshot only if the platform has no LIVE data yet; otherwise any month that
  // starts before the first LIVE date is (at least partly) reconstructed.
  const firstLive = firstLiveSnapshot ? toDay(firstLiveSnapshot) : null
  const anyReconstructed = points.length > 0 && (firstLive === null || points.some((p) => p.date < firstLive))
  return { points, reconstructedBefore: anyReconstructed ? (firstLive ?? toDay(new Date())) : null }
}

export const adminUsersDetailService = {
  async getUserDetail(userId: string): Promise<AdminUserDetail> {
    if (!ID_PATTERN.test(userId)) throw userNotFound()

    const user = await repo.findUser(userId)
    if (!user) throw userNotFound()

    // Independent reads run in parallel (target p95 < 250ms). Secondary parts are isolated: a failure degrades to an
    // empty section, never a 500.
    const [counts, sessions, activity] = await Promise.all([
      isolate('user.commitment-stats', () => repo.commitmentCountsByStatus(userId), [] as Awaited<ReturnType<typeof repo.commitmentCountsByStatus>>),
      isolate('user.sessions', () => repo.recentSessions(userId), [] as Awaited<ReturnType<typeof repo.recentSessions>>),
      isolate('user.staff-activity', () => repo.staffActivity(userId), [] as Awaited<ReturnType<typeof repo.staffActivity>>),
    ])

    const byStatus = new Map(counts.map((c) => [c.status, c._count._all]))
    const activeSuspension = user.suspensions[0] ?? null

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt.toISOString(),
      lastActiveAt: iso(user.lastActiveAt ?? user.lastLoginAt),
      timezone: user.timezone ?? null,
      avatarUrl: user.avatarUrl ?? null,
      status: deriveUserStatus(!!activeSuspension, user.emailVerified),
      suspension: activeSuspension
        ? {
            reason: activeSuspension.reason,
            suspendedAt: activeSuspension.suspendedAt.toISOString(),
            suspendedByName: activeSuspension.suspender.name,
          }
        : null,
      team: user.team ? { id: user.team.id, name: user.team.name, slug: user.team.slug, plan: user.team.plan } : null,
      commitmentScore: user.commitmentScore ?? null,
      stats: {
        commitmentsTotal: counts.reduce((sum, c) => sum + c._count._all, 0),
        fulfilled: byStatus.get('FULFILLED') ?? 0,
        missed: byStatus.get('MISSED') ?? 0,
        pending: byStatus.get('PENDING') ?? 0,
      },
      sessions: sessions.map((s) => ({
        id: s.id,
        ipAddress: s.ipAddress ?? null,
        userAgent: s.userAgent ?? null,
        lastUsedAt: iso(s.lastUsedAt),
        createdAt: s.createdAt.toISOString(),
      })),
      staffActivity: activity.map((a) => ({
        id: a.id,
        action: a.action,
        actorName: a.adminUser?.name ?? null,
        reason: typeof (a.metadata as Record<string, unknown> | null)?.reason === 'string' ? ((a.metadata as { reason: string }).reason) : null,
        createdAt: a.createdAt.toISOString(),
      })),
    }
  },

  async getTeamDetail(teamId: string): Promise<AdminTeamDetail> {
    if (!ID_PATTERN.test(teamId)) throw teamNotFound()

    const team = await repo.findTeam(teamId)
    if (!team) throw teamNotFound()

    const [owner, seatsUsed, integrations, health, history] = await Promise.all([
      isolate('team.owner', () => repo.findTeamOwner(teamId), null),
      isolate('team.seats', () => repo.countTeamMembers(teamId), 0),
      isolate('team.integrations', () => repo.activeIntegrationProviders(teamId), [] as string[]),
      // Reuses the existing team health service (5-minute cache) — nothing is recomputed on the admin side.
      isolate(
        'team.health',
        async () => {
          const h = await teamHealthService.calculateTeamHealthScore(teamId)
          return { score: h.score, trend: h.trend }
        },
        null as AdminTeamDetail['health'],
        1_500,
      ),
      isolate(
        'team.mrr-history',
        async () => {
          const [rows, firstLive] = await Promise.all([repo.monthlyMrrSnapshots(teamId), repo.firstLiveSnapshotDate()])
          return shapeMrrHistory(rows, firstLive)
        },
        { points: [], reconstructedBefore: null } as ReturnType<typeof shapeMrrHistory>,
      ),
    ])

    const limits = PLAN_LIMITS[team.plan]
    const sub = team.subscription
    const interval: 'month' | 'year' = sub?.billingInterval === 'year' ? 'year' : 'month'

    return {
      id: team.id,
      name: team.name,
      slug: team.slug,
      createdAt: team.createdAt.toISOString(),
      owner: owner ? { id: owner.id, name: owner.name, email: owner.email } : null,
      plan: team.plan,
      subscription: sub
        ? {
            id: sub.id,
            status: sub.status,
            interval,
            amountCents: sub.unitAmount ?? 0,
            mrrCents: subscriptionMrrCents(sub.status, sub.unitAmount ?? 0, interval),
            currentPeriodEnd: iso(sub.currentPeriodEnd),
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          }
        : null,
      seats: { used: seatsUsed, limit: limitOrNull(limits?.members) },
      usage: { meetingsUsed: team.meetingsUsed, meetingLimit: limitOrNull(limits?.meetings) },
      health,
      integrations,
      mrrHistory: history.points,
      mrrHistoryReconstructedBefore: history.reconstructedBefore,
    }
  },
}
