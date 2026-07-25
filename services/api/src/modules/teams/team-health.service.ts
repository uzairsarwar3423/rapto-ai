import { CommitmentStatus } from '@prisma/client'
import { prisma } from '../../db/client'
import { redis } from '../../config/redis'
import { logger } from '../../config/logger'
import { subDays, startOfWeek, addDays } from 'date-fns'
import type { TeamHealthScore, HealthTrend } from './teams.types'

const HEALTH_CACHE_TTL = 300 // 5 minutes
const ANALYSIS_WINDOW_DAYS = 30
const TREND_WINDOW_DAYS = 14
const TREND_THRESHOLD = 5 // points difference to call a trend
const MIN_CONFIDENCE_SCORE = 0.5

function healthCacheKey(teamId: string): string {
  return `cache:team:health:${teamId}`
}

export interface MemberDelta {
  userId: string
  name: string
  previousScore: number
  currentScore: number
  change: number
}

export interface UpcomingDeadline {
  commitmentId: string
  text: string
  ownerName: string
  dueDate: string
}

export interface WeeklyDigestData {
  teamId: string
  teamName: string
  healthScore: number
  healthScoreChange: number
  mostImproved: MemberDelta[]
  mostDeclined: MemberDelta[]
  fulfilledCount: number
  missedCount: number
  upcomingDeadlines: UpcomingDeadline[]
}

/**
 * Calculate fulfillment rate for a given date range.
 * Only counts commitments with confidence >= MIN_CONFIDENCE_SCORE.
 * Defaults to rate = 100, onTimeRate = 100 if zero decided commitments exist.
 */
async function computeFulfillmentRate(
  teamId: string,
  fromDate: Date,
  toDate: Date
): Promise<{ rate: number; fulfilled: number; missed: number; onTimeRate: number; totalDecided: number }> {
  const commitments = await prisma.commitment.findMany({
    where: {
      teamId,
      createdAt: { gte: fromDate, lte: toDate },
      confidenceScore: { gte: MIN_CONFIDENCE_SCORE },
      status: { in: [CommitmentStatus.FULFILLED, CommitmentStatus.MISSED] },
    },
    select: {
      status: true,
      resolvedAt: true,
      dueDate: true,
    },
  })

  if (commitments.length === 0) {
    return { rate: 100, fulfilled: 0, missed: 0, onTimeRate: 100, totalDecided: 0 }
  }

  const fulfilled = commitments.filter((c) => c.status === CommitmentStatus.FULFILLED)
  const missed = commitments.filter((c) => c.status === CommitmentStatus.MISSED)
  const totalDecided = fulfilled.length + missed.length

  const fulfillmentRate = totalDecided === 0 ? 100 : Math.round((fulfilled.length / totalDecided) * 100)

  // On-time: fulfilled before or on the due date
  const fulfilledOnTime = fulfilled.filter((c) => {
    if (!c.dueDate || !c.resolvedAt) return false
    return c.resolvedAt <= c.dueDate
  })

  const onTimeRate =
    fulfilled.length > 0 ? Math.round((fulfilledOnTime.length / fulfilled.length) * 100) : 100

  return {
    rate: fulfillmentRate,
    fulfilled: fulfilled.length,
    missed: missed.length,
    onTimeRate,
    totalDecided,
  }
}

/**
 * Calculate the average commitment score across all active team members.
 * commitmentScore is a denormalized field on the users table — updated after every status change.
 */
async function computeAvgMemberScore(teamId: string): Promise<number> {
  const result = await prisma.user.aggregate({
    where: { teamId, deletedAt: null },
    _avg: { commitmentScore: true },
  })

  return Math.round(result._avg.commitmentScore ?? 100)
}

/**
 * Determine trend by comparing the last 14 days vs the prior 14 days.
 * Returns 'stable' if either window has zero decided commitments or diff is within ±5 points.
 */
async function computeTrend(teamId: string): Promise<HealthTrend> {
  const now = new Date()
  const recentFrom = subDays(now, TREND_WINDOW_DAYS)
  const priorFrom = subDays(now, TREND_WINDOW_DAYS * 2)

  const [recent, prior] = await Promise.all([
    computeFulfillmentRate(teamId, recentFrom, now),
    computeFulfillmentRate(teamId, priorFrom, recentFrom),
  ])

  if (recent.totalDecided === 0 || prior.totalDecided === 0) {
    return 'stable'
  }

  const diff = recent.rate - prior.rate

  if (diff > TREND_THRESHOLD) return 'improving'
  if (diff < -TREND_THRESHOLD) return 'declining'
  return 'stable'
}

/**
 * Calculate team health score.
 * Formula: fulfillmentRate * 0.6 + avgMemberScore * 0.3 + onTimeRate * 0.1
 * Result is cached for 5 minutes.
 */
export async function calculateTeamHealthScore(teamId: string): Promise<TeamHealthScore> {
  // 1. Cache check
  try {
    const cached = await redis.get(healthCacheKey(teamId))
    if (cached) {
      return JSON.parse(cached) as TeamHealthScore
    }
  } catch {
    // Redis unavailable — fall through
  }

  // 2. Compute all metrics in parallel
  const now = new Date()
  const fromDate = subDays(now, ANALYSIS_WINDOW_DAYS)

  let fulfillmentData = { rate: 100, fulfilled: 0, missed: 0, onTimeRate: 100, totalDecided: 0 }
  let avgMemberScore = 100
  let trend: HealthTrend = 'stable'

  try {
    ;[fulfillmentData, avgMemberScore, trend] = await Promise.all([
      computeFulfillmentRate(teamId, fromDate, now),
      computeAvgMemberScore(teamId),
      computeTrend(teamId),
    ])
  } catch (error) {
    logger.error({ error, teamId }, 'Error computing team health metrics')
    return {
      score: 100,
      trend: 'stable',
      fulfillmentRate: 100,
      avgMemberScore: 100,
      onTimeRate: 100,
      computedAt: new Date(),
      basedOnDays: ANALYSIS_WINDOW_DAYS,
    }
  }

  // 3. Weighted formula
  const score = Math.round(
    fulfillmentData.rate * 0.6 +
    avgMemberScore * 0.3 +
    fulfillmentData.onTimeRate * 0.1
  )

  const result: TeamHealthScore = {
    score: Math.min(100, Math.max(0, score)), // clamp to [0, 100]
    trend,
    fulfillmentRate: fulfillmentData.rate,
    avgMemberScore,
    onTimeRate: fulfillmentData.onTimeRate,
    computedAt: new Date(),
    basedOnDays: ANALYSIS_WINDOW_DAYS,
  }

  // 4. Cache result
  try {
    await redis.setex(healthCacheKey(teamId), HEALTH_CACHE_TTL, JSON.stringify(result))
  } catch {
    // Non-fatal
  }

  return result
}

/**
 * Invalidate the health score cache for a team.
 * Called after any commitment status change.
 */
export async function invalidateHealthCache(teamId: string): Promise<void> {
  try {
    await redis.del(healthCacheKey(teamId))
  } catch {
    // Non-fatal
  }
}

/**
 * Assembles the content data payload for the Weekly Digest email/Slack dispatch.
 */
export async function buildWeeklyDigestData(teamId: string): Promise<WeeklyDigestData> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { name: true },
  })

  const teamName = team?.name || 'Your Team'
  const currentHealth = await calculateTeamHealthScore(teamId)

  const now = new Date()
  const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 })
  const lastWeekStart = subDays(thisWeekStart, 7)

  // Query member snapshots for current week vs prior week to derive most-improved / most-declined
  const snapshots = await prisma.commitmentScoreSnapshot.findMany({
    where: {
      teamId,
      weekStart: { in: [thisWeekStart, lastWeekStart] },
    },
    include: {
      user: { select: { id: true, name: true } },
    },
  })

  const memberSnapshotsMap = new Map<string, { current?: number; prior?: number; name: string }>()

  for (const s of snapshots) {
    const existing = memberSnapshotsMap.get(s.userId) || { name: s.user?.name || 'Team Member' }
    if (s.weekStart.getTime() === thisWeekStart.getTime()) {
      existing.current = s.commitmentScore
    } else {
      existing.prior = s.commitmentScore
    }
    memberSnapshotsMap.set(s.userId, existing)
  }

  const memberDeltas: MemberDelta[] = []
  memberSnapshotsMap.forEach((val, userId) => {
    if (val.current !== undefined && val.prior !== undefined) {
      memberDeltas.push({
        userId,
        name: val.name,
        previousScore: val.prior,
        currentScore: val.current,
        change: val.current - val.prior,
      })
    }
  })

  const mostImproved = memberDeltas
    .filter((d) => d.change > 0)
    .sort((a, b) => b.change - a.change)
    .slice(0, 3)

  const mostDeclined = memberDeltas
    .filter((d) => d.change < 0)
    .sort((a, b) => a.change - b.change)
    .slice(0, 3)

  // Weekly fulfilled and missed counts (trailing 7 days)
  const trailing7Days = subDays(now, 7)
  const weeklyCommitments = await prisma.commitment.findMany({
    where: {
      teamId,
      createdAt: { gte: trailing7Days },
      status: { in: [CommitmentStatus.FULFILLED, CommitmentStatus.MISSED] },
    },
    select: { status: true },
  })

  const fulfilledCount = weeklyCommitments.filter((c) => c.status === CommitmentStatus.FULFILLED).length
  const missedCount = weeklyCommitments.filter((c) => c.status === CommitmentStatus.MISSED).length

  // Upcoming deadlines in next 7 days
  const next7Days = addDays(now, 7)
  const pendingUpcoming = await prisma.commitment.findMany({
    where: {
      teamId,
      status: CommitmentStatus.PENDING,
      dueDate: { gte: now, lte: next7Days },
    },
    include: {
      owner: { select: { name: true } },
    },
    orderBy: { dueDate: 'asc' },
    take: 5,
  })

  const upcomingDeadlines: UpcomingDeadline[] = pendingUpcoming.map((c) => ({
    commitmentId: c.id,
    text: c.text,
    ownerName: c.owner?.name || 'Member',
    dueDate: c.dueDate ? c.dueDate.toISOString() : '',
  }))

  // Estimate health score change from previous week if snapshot exists
  const previousTeamSnapshots = await prisma.commitmentScoreSnapshot.findMany({
    where: { teamId, weekStart: lastWeekStart },
    select: { commitmentScore: true },
  })
  const prevAvgScore = previousTeamSnapshots.length > 0
    ? Math.round(previousTeamSnapshots.reduce((acc, s) => acc + s.commitmentScore, 0) / previousTeamSnapshots.length)
    : currentHealth.score

  const healthScoreChange = currentHealth.score - prevAvgScore

  return {
    teamId,
    teamName,
    healthScore: currentHealth.score,
    healthScoreChange,
    mostImproved,
    mostDeclined,
    fulfilledCount,
    missedCount,
    upcomingDeadlines,
  }
}

export const teamHealthService = {
  calculateTeamHealthScore,
  invalidateHealthCache,
  buildWeeklyDigestData,
}

