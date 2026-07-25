import { prisma } from '../db/client'
import { subDays } from 'date-fns'
import { logger } from '../config/logger'
import { SERVER_EVENTS } from '../realtime/socket.events'
import { teamRoom, userRoom } from '../realtime/rooms.manager'

export interface CommitmentScoreResult {
  score: number
  fulfillmentRate: number
  onTimeRate: number
  trend: 'improving' | 'stable' | 'declining'
  total: number
  fulfilled: number
  missed: number
  pending: number
}

export type ScoreRecalculationSource =
  | 'manual_status_change'
  | 'ai_resolution'
  | 'deadline_cron'
  | 'weekly_snapshot'

/**
 * Single authoritative implementation of commitment score calculation.
 * Reads from DB without writing, returning the composite score and breakdown metrics.
 */
export async function calculateCommitmentScore(
  userId: string,
  teamId: string,
  periodDays = 30
): Promise<CommitmentScoreResult> {
  const since = subDays(new Date(), periodDays)

  const commitments = await prisma.commitment.findMany({
    where: {
      ownerId: userId,
      teamId,
      createdAt: { gte: since },
      status: { in: ['FULFILLED', 'MISSED', 'PENDING'] },
      confidenceScore: { gte: 0.5 },
    },
  })

  if (commitments.length === 0) {
    return {
      score: 100,
      fulfillmentRate: 100,
      onTimeRate: 100,
      trend: 'stable',
      total: 0,
      fulfilled: 0,
      missed: 0,
      pending: 0,
    }
  }

  const fulfilled = commitments.filter((c) => c.status === 'FULFILLED').length
  const missed = commitments.filter((c) => c.status === 'MISSED').length
  const pending = commitments.filter((c) => c.status === 'PENDING').length
  const total = commitments.length
  const decided = fulfilled + missed

  // 1. Base fulfillment rate (excludes pending). Default to 100 if zero decided commitments.
  const baseFulfillmentRate = decided === 0 ? 100 : Math.round((fulfilled / decided) * 100)

  // 2. Recency weighting: last 7 days count at 1.0, older 7-30 days count at 0.7
  const recentCutoff = subDays(new Date(), 7)
  const recentFulfilled = commitments.filter(
    (c) => c.status === 'FULFILLED' && c.createdAt >= recentCutoff
  ).length
  const recentDecided = commitments.filter(
    (c) => ['FULFILLED', 'MISSED'].includes(c.status) && c.createdAt >= recentCutoff
  ).length
  const olderFulfilled = fulfilled - recentFulfilled
  const olderDecided = decided - recentDecided

  let weightedRate = 100
  if (decided > 0) {
    const rw = recentDecided > 0 ? (recentFulfilled / recentDecided) * 1.0 * recentDecided : 0
    const ow = olderDecided > 0 ? (olderFulfilled / olderDecided) * 0.7 * olderDecided : 0
    const tw = recentDecided * 1.0 + olderDecided * 0.7
    weightedRate = tw > 0 ? ((rw + ow) / tw) * 100 : 100
  }

  // 3. On-time bonus: up to +10 points for on-time fulfilled commitments
  const onTimeFulfilled = commitments.filter(
    (c) => c.status === 'FULFILLED' && c.resolvedAt && c.dueDate && c.resolvedAt <= c.dueDate
  ).length
  const onTimeRate = fulfilled === 0 ? 100 : Math.round((onTimeFulfilled / fulfilled) * 100)
  const onTimeBonus = fulfilled === 0 ? 0 : (onTimeRate / 100) * 10

  // 4. Final score composition: clamped to [0, 100]
  const rawScore = weightedRate + onTimeBonus
  const score = Math.min(100, Math.max(0, Math.round(rawScore)))

  // 5. Trend indicator
  const trend = await calculateScoreTrend(userId, teamId)

  return {
    score,
    fulfillmentRate: baseFulfillmentRate,
    onTimeRate,
    trend,
    total,
    fulfilled,
    missed,
    pending,
  }
}

/**
 * Calculates score trend comparing the current 7-day window vs prior 7-day window.
 * Returns 'stable' if there are zero decided commitments in either window or if diff is within ±5 points.
 */
export async function calculateScoreTrend(
  userId: string,
  teamId: string
): Promise<'improving' | 'stable' | 'declining'> {
  const now = new Date()
  const thisWeekStart = subDays(now, 7)
  const priorWeekStart = subDays(now, 14)

  const [thisWeekDecided, priorWeekDecided] = await Promise.all([
    prisma.commitment.findMany({
      where: {
        ownerId: userId,
        teamId,
        createdAt: { gte: thisWeekStart, lt: now },
        status: { in: ['FULFILLED', 'MISSED'] },
        confidenceScore: { gte: 0.5 },
      },
    }),
    prisma.commitment.findMany({
      where: {
        ownerId: userId,
        teamId,
        createdAt: { gte: priorWeekStart, lt: thisWeekStart },
        status: { in: ['FULFILLED', 'MISSED'] },
        confidenceScore: { gte: 0.5 },
      },
    }),
  ])

  // Edge case: zero decided commitments in either window -> stable
  if (thisWeekDecided.length === 0 || priorWeekDecided.length === 0) {
    return 'stable'
  }

  const thisWeekFulfilled = thisWeekDecided.filter((c) => c.status === 'FULFILLED').length
  const priorWeekFulfilled = priorWeekDecided.filter((c) => c.status === 'FULFILLED').length

  const thisWeekRate = Math.round((thisWeekFulfilled / thisWeekDecided.length) * 100)
  const priorWeekRate = Math.round((priorWeekFulfilled / priorWeekDecided.length) * 100)

  const diff = thisWeekRate - priorWeekRate
  if (diff > 5) return 'improving'
  if (diff < -5) return 'declining'
  return 'stable'
}

/**
 * Denormalized write path helper.
 * Updates users.commitmentScore column and emits real-time Socket.io events.
 */
export async function persistScore(
  userId: string,
  teamId: string,
  scoreResult: CommitmentScoreResult,
  source: ScoreRecalculationSource = 'manual_status_change'
): Promise<void> {
  const userBefore = await prisma.user.findUnique({
    where: { id: userId },
    select: { commitmentScore: true },
  })

  const previousScore = userBefore?.commitmentScore ?? scoreResult.score
  const change = scoreResult.score - previousScore

  await prisma.user.update({
    where: { id: userId },
    data: { commitmentScore: scoreResult.score },
  })

  try {
    const payload = {
      userId,
      teamId,
      newScore: scoreResult.score,
      previousScore,
      change,
      trend: scoreResult.trend,
      details: scoreResult,
      source,
    }

    const { socketEmitter } = await import('../realtime/socket.emitter')
    socketEmitter.to(userRoom(userId)).emit(SERVER_EVENTS.MEMBER_SCORE_UPDATED, payload)
    socketEmitter.to(teamRoom(teamId)).emit(SERVER_EVENTS.MEMBER_SCORE_UPDATED, payload)
    socketEmitter.to(userRoom(userId)).emit(SERVER_EVENTS.MY_SCORE_UPDATED, { newScore: scoreResult.score })
  } catch (err) {
    logger.warn({ err, userId, teamId }, 'score.service: Socket.io emit failed (non-fatal)')
  }

  logger.info(
    {
      userId,
      teamId,
      previousScore,
      newScore: scoreResult.score,
      trend: scoreResult.trend,
      source,
    },
    'score.service: score recalculated and persisted'
  )
}

