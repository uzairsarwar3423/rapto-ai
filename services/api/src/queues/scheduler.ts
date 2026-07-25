// ─────────────────────────────────────────────────────────────────────────────
// scheduler.ts — Cron Job Registrations
//
// Day 64 Update:
//   Proactive token refresh cron ('*/15 * * * *') refactored to use
//   findExpiringIntegrations() from token-refresh.service.ts.
//   Fans out per-integration jobs with 15-minute bucketed jobIds to
//   tokenRefreshQueue.
// ─────────────────────────────────────────────────────────────────────────────

import cron from 'node-cron'
import { logger } from '../config/logger'
import { runDeadlineReminders, markMissedCommitments } from './workers/deadline.worker'
import { calendarSyncQueue, tokenRefreshQueue } from './queue.client'
import { prisma } from '../db/client'
import { findExpiringIntegrations } from '../services/token-refresh.service'
import { startOfWeek, getISOWeek, getISOWeekYear, subDays } from 'date-fns'

async function enqueueTokenRefreshJobs(): Promise<void> {
    try {
        const { teamIntegrations, userIntegrations } = await findExpiringIntegrations(30)
        const bucketTimestamp = Math.floor(Date.now() / (15 * 60 * 1000))

        logger.info(
            { teamCount: teamIntegrations.length, userCount: userIntegrations.length },
            'token-refresh cron: enqueueing expiring integrations'
        )

        for (const { id } of teamIntegrations) {
            await tokenRefreshQueue.add(
                'refresh-team-token',
                { type: 'team', integrationId: id },
                {
                    jobId: `refresh-team-token:${id}:${bucketTimestamp}`,
                    attempts: 1,
                }
            )
        }

        for (const { id } of userIntegrations) {
            await tokenRefreshQueue.add(
                'refresh-user-token',
                { type: 'user', integrationId: id },
                {
                    jobId: `refresh-user-token:${id}:${bucketTimestamp}`,
                    attempts: 1,
                }
            )
        }
    } catch (err: any) {
        logger.error({ err: err.message }, 'token-refresh cron: failed during job fan-out')
    }
}

async function enqueueCalendarSyncJobs(): Promise<void> {
    const integrations = await prisma.userIntegration.findMany({
        where: {
            provider: 'GOOGLE_CALENDAR',
            syncEnabled: true,
            OR: [
                { lastSyncedAt: null },
                { lastSyncedAt: { lte: new Date(Date.now() - 50 * 60 * 1000) } },
            ],
        },
        select: { userId: true },
    })

    logger.info({ count: integrations.length }, 'calendar-sync cron: enqueueing per-user jobs')

    for (const { userId } of integrations) {
        await calendarSyncQueue.add(
            'sync-user-calendar',
            { userId },
            {
                jobId: `calendar-sync:${userId}:${Math.floor(Date.now() / (60 * 60 * 1000))}`,
                attempts: 3,
                backoff: { type: 'exponential', delay: 30_000 },
            }
        )
    }
}

export async function runWeeklyScoreSnapshotCron(): Promise<void> {
    const now = new Date()
    const weekStart = startOfWeek(now, { weekStartsOn: 1 })
    const isoWeekStr = `${getISOWeekYear(now)}-W${String(getISOWeek(now)).padStart(2, '0')}`

    const teamMembers = await prisma.user.findMany({
        where: { teamId: { not: null } },
        select: { id: true, teamId: true },
    })

    logger.info({ count: teamMembers.length, isoWeek: isoWeekStr }, 'weekly-snapshot cron: starting score recalculation & snapshot write')

    const { calculateCommitmentScore, persistScore } = await import('../services/score.service')

    const BATCH_SIZE = 50
    for (let i = 0; i < teamMembers.length; i += BATCH_SIZE) {
        const batch = teamMembers.slice(i, i + BATCH_SIZE)
        await Promise.all(
            batch.map(async ({ id: userId, teamId }) => {
                if (!teamId) return
                try {
                    const scoreResult = await calculateCommitmentScore(userId, teamId)
                    const deferredCount = await prisma.commitment.count({
                        where: {
                            ownerId: userId,
                            teamId,
                            status: 'DEFERRED',
                            createdAt: { gte: subDays(now, 30) },
                        },
                    })

                    await prisma.commitmentScoreSnapshot.upsert({
                        where: {
                            userId_weekStart: {
                                userId,
                                weekStart,
                            },
                        },
                        create: {
                            userId,
                            teamId,
                            weekStart,
                            isoWeek: isoWeekStr,
                            commitmentScore: scoreResult.score,
                            fulfillmentRate: scoreResult.fulfillmentRate,
                            onTimeRate: scoreResult.onTimeRate,
                            totalCommitments: scoreResult.total,
                            fulfilledCount: scoreResult.fulfilled,
                            missedCount: scoreResult.missed,
                            deferredCount,
                        },
                        update: {
                            teamId,
                            isoWeek: isoWeekStr,
                            commitmentScore: scoreResult.score,
                            fulfillmentRate: scoreResult.fulfillmentRate,
                            onTimeRate: scoreResult.onTimeRate,
                            totalCommitments: scoreResult.total,
                            fulfilledCount: scoreResult.fulfilled,
                            missedCount: scoreResult.missed,
                            deferredCount,
                        },
                    })

                    await persistScore(userId, teamId, scoreResult, 'weekly_snapshot')
                } catch (err) {
                    logger.error({ err, userId, teamId }, 'weekly-snapshot cron: failed for member')
                }
            })
        )
    }

    logger.info('weekly-snapshot cron: finished processing all active team members')

    // Pre-compute & cache team health scores for all teams
    const uniqueTeamIds = [...new Set(teamMembers.map((m) => m.teamId).filter((t): t is string => Boolean(t)))]
    const { teamHealthService } = await import('../modules/teams/team-health.service')
    for (const teamId of uniqueTeamIds) {
        try {
            await teamHealthService.calculateTeamHealthScore(teamId)
        } catch (err) {
            logger.error({ err, teamId }, 'weekly-snapshot cron: failed pre-computing team health score')
        }
    }
}

export async function runWeeklyDigestDispatchCron(): Promise<void> {
    const teams = await prisma.team.findMany({
        where: {
            plan: { in: ['GROWTH', 'BUSINESS', 'ENTERPRISE'] },
        },
        select: { id: true, name: true, plan: true },
    })

    logger.info({ count: teams.length }, 'weekly-digest cron: enqueueing per-team digest dispatch jobs')

    const { notifyQueue } = await import('./queue.client')

    for (const team of teams) {
        try {
            await notifyQueue.add('weekly-digest', {
                type: 'WEEKLY_DIGEST',
                teamId: team.id,
            })
        } catch (err: any) {
            logger.error({ err: err.message, teamId: team.id }, 'weekly-digest cron: failed enqueueing job for team')
        }
    }
}

export function startScheduler(): void {
    // ── Day 19: Commitment deadline reminders (9 AM UTC daily) ───────────────
    cron.schedule('0 9 * * *', async () => {
        logger.info('Cron: running deadline reminders')
        try {
            await runDeadlineReminders()
        } catch (err) {
            logger.error({ err }, 'Cron: deadline reminders failed')
        }
    })

    // ── Day 19: Mark missed commitments (6 PM UTC daily) ─────────────────────
    cron.schedule('0 18 * * *', async () => {
        logger.info('Cron: marking missed commitments')
        try {
            await markMissedCommitments()
        } catch (err) {
            logger.error({ err }, 'Cron: mark missed failed')
        }
    })

    // ── Day 70: Weekly digest dispatch (Monday 9 AM UTC) ─────────────────────
    cron.schedule('0 9 * * 1', async () => {
        logger.info('Cron: running weekly digest dispatch')
        try {
            await runWeeklyDigestDispatchCron()
        } catch (err) {
            logger.error({ err }, 'Cron: weekly digest dispatch failed')
        }
    })

    // ── Day 69: Weekly commitment score snapshot (Sunday midnight UTC) ───────
    cron.schedule('0 0 * * 0', async () => {
        logger.info('Cron: running weekly commitment score snapshot')
        try {
            await runWeeklyScoreSnapshotCron()
        } catch (err) {
            logger.error({ err }, 'Cron: weekly snapshot failed')
        }
    })

    // ── Day 22: Calendar sync fan-out (HOURLY) ────────────────────────────────
    cron.schedule('0 * * * *', async () => {
        logger.info('Cron: enqueueing calendar sync jobs (hourly)')
        try {
            await enqueueCalendarSyncJobs()
        } catch (err) {
            logger.error({ err }, 'Cron: calendar sync enqueue failed')
        }
    })

    // ── Day 64: Proactive token refresh (EVERY 15 MINUTES) ───────────────────
    cron.schedule('*/15 * * * *', async () => {
        logger.info('Cron: running proactive token refresh')
        await enqueueTokenRefreshJobs()
    })

    logger.info(
        'Scheduler started: deadline-reminder@9AM, mark-missed@6PM, digest@Mon9AM, snapshot@SunMidnight, calendar-sync@hourly, token-refresh@15min'
    )
}
