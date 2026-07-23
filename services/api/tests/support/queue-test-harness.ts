// ─────────────────────────────────────────────────────────────────────────────
// queue-test-harness.ts — BullMQ Queue Execution Harness for Testing
//
// Provides deterministic single-job execution for unit/integration tests and
// genuine-concurrency batch execution for load & concurrency sanity verification.
// ─────────────────────────────────────────────────────────────────────────────

import { Job, Worker, Queue } from 'bullmq'
import { logger } from '../../src/config/logger'

export interface JobExecutionResult<T = any> {
    success: boolean
    result?: T
    error?: Error
    durationMs: number
}

/**
 * Deterministically executes a single worker processor function directly
 * with mocked job metadata, avoiding queue async non-determinism during standard tests.
 */
export async function executeJobDirectly<TData = any, TResult = any>(
    processor: (job: Job<TData, TResult, string>) => Promise<TResult>,
    jobData: TData,
    jobName = 'test-job'
): Promise<JobExecutionResult<TResult>> {
    const startTime = Date.now()
    const mockJob = {
        id: `mock_job_${Math.random().toString(36).substring(2, 9)}`,
        name: jobName,
        data: jobData,
        attemptsMade: 0,
        opts: {},
        updateData: async (data: TData) => {
            mockJob.data = data
        },
        log: async (msg: string) => {
            logger.debug({ jobName, msg }, 'MockJob log')
        },
    } as unknown as Job<TData, TResult, string>

    try {
        const result = await processor(mockJob)
        const durationMs = Date.now() - startTime
        return { success: true, result, durationMs }
    } catch (err: any) {
        const durationMs = Date.now() - startTime
        return { success: false, error: err, durationMs }
    }
}

/**
 * Simulates genuine concurrent job execution across multiple worker threads/promises
 * to verify isolation, lock contention, and queue concurrency limits under volume.
 */
export async function runConcurrentBatch<TData = any, TResult = any>(
    processor: (job: Job<TData, TResult, string>) => Promise<TResult>,
    jobBatch: TData[],
    concurrency: number
): Promise<{
    results: Array<JobExecutionResult<TResult>>
    maxSimultaneousActive: number
    totalDurationMs: number
}> {
    const startTime = Date.now()
    let currentlyActive = 0
    let maxSimultaneousActive = 0
    const results: Array<JobExecutionResult<TResult>> = new Array(jobBatch.length)

    // Execute batch with pool-controlled concurrency
    const pool = new Array(concurrency)
    let index = 0

    const workerLoop = async () => {
        while (index < jobBatch.length) {
            const currentIndex = index++
            const data = jobBatch[currentIndex]

            currentlyActive++
            if (currentlyActive > maxSimultaneousActive) {
                maxSimultaneousActive = currentlyActive
            }

            const res = await executeJobDirectly(processor, data, `batch_job_${currentIndex}`)
            results[currentIndex] = res

            currentlyActive--
        }
    }

    const workerPromises = Array.from({ length: concurrency }).map(() => workerLoop())
    await Promise.all(workerPromises)

    const totalDurationMs = Date.now() - startTime

    return {
        results,
        maxSimultaneousActive,
        totalDurationMs,
    }
}
