import { Worker, Job } from 'bullmq'
import { logger } from '../../config/logger'
import { syncUserCalendar } from '../../services/calendar-sync.service'
import type { CalendarSyncJobData } from '../jobs/calendar-sync.job'

// Concurrency is a tunable, environment-driven setting
const CONCURRENCY = process.env.CALENDAR_SYNC_CONCURRENCY 
    ? parseInt(process.env.CALENDAR_SYNC_CONCURRENCY, 10) 
    : 5

export const calendarSyncWorker = new Worker<CalendarSyncJobData>(
    'calendar-sync',
    async (job: Job<CalendarSyncJobData>) => {
        const { userId } = job.data
        const start = Date.now()
        
        try {
            const result = await syncUserCalendar(userId)
            const durationMs = Date.now() - start
            
            logger.info(
                { userId, ...result, durationMs, jobId: job.id },
                'calendar-sync.worker: sync complete'
            )
            
            return { userId, ...result, durationMs }
        } catch (error: any) {
            logger.error(
                { userId, jobId: job.id, err: error.message },
                'calendar-sync.worker: sync failed'
            )
            throw error // Trigger BullMQ retry
        }
    },
    {
        connection: { host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT ?? '6379') },
        concurrency: CONCURRENCY,
    }
)

calendarSyncWorker.on('failed', (job: Job<CalendarSyncJobData> | undefined, err: Error) => {
    logger.error(
        { jobId: job?.id, userId: job?.data?.userId, err: err.message },
        'calendar-sync.worker: job failed completely'
    )
})
