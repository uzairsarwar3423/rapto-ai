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

    // ── Day 19: Weekly digest (Monday 9 AM UTC) ───────────────────────────────
    cron.schedule('0 9 * * 1', async () => {
        logger.info('Cron: sending weekly digest')
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
        'Scheduler started: deadline-reminder@9AM, mark-missed@6PM, digest@Mon9AM, calendar-sync@hourly, token-refresh@15min'
    )
}
