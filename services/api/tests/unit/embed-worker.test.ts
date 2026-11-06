/**
 * Auto-embedding after extraction: the embed worker's decisions and the AI client's backfill-outcome mapping.
 * Pure unit test: bullmq, env and the logger are mocked, nothing touches Redis, Postgres or the network.
 */

const mockEnv = {
  RAG_AUTO_EMBED_ENABLED: true,
  AI_PIPELINE_URL: 'http://ai.test',
  AI_PIPELINE_SECRET: 'x'.repeat(40),
  AI_PIPELINE_TIMEOUT_MS: 1000,
  AI_PIPELINE_MAX_RETRIES: 0,
  AI_PIPELINE_RETRY_BASE_DELAY_MS: 1,
  AI_PIPELINE_CIRCUIT_FAILURE_THRESHOLD: 5,
  AI_PIPELINE_CIRCUIT_WINDOW_MS: 60000,
  AI_PIPELINE_CIRCUIT_OPEN_TIMEOUT_MS: 30000,
}

jest.mock('../../src/config/env', () => ({ env: mockEnv }))
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), fatal: jest.fn() },
}))
jest.mock('bullmq', () => {
  class UnrecoverableError extends Error {}
  class Worker {
    on = jest.fn()
  }
  return { Worker, UnrecoverableError }
})

import { UnrecoverableError } from 'bullmq'
import { AIPipelineClient } from '../../src/services/ai-pipeline/ai-pipeline.client'
import { AIPipelineNetworkError } from '../../src/services/ai-pipeline/ai-pipeline.errors'
import { aipipelineClient } from '../../src/services/ai-pipeline/ai-pipeline.client'
import { EMBED_SOURCE_TYPES, processEmbedJob, sinceDate } from '../../src/queues/workers/embed.worker'

const job = { id: 'j1', data: { meetingId: 'm1', teamId: 't1' } }

describe('sinceDate', () => {
  it('is the UTC calendar day 24h earlier', () => {
    expect(sinceDate(new Date('2026-11-07T10:30:00Z'))).toBe('2026-11-06')
    expect(sinceDate(new Date('2026-11-07T00:00:00Z'))).toBe('2026-11-06')
  })

  it('widens with `days`', () => {
    expect(sinceDate(new Date('2026-11-07T10:30:00Z'), 3)).toBe('2026-11-04')
  })
})

describe('processEmbedJob', () => {
  let spy: jest.SpyInstance

  beforeEach(() => {
    mockEnv.RAG_AUTO_EMBED_ENABLED = true
    spy = jest.spyOn(aipipelineClient, 'startEmbeddingBackfill')
  })
  afterEach(() => spy.mockRestore())

  it('asks for an incremental backfill of every RAG source type for the meeting\'s team', async () => {
    spy.mockResolvedValue({ outcome: 'started', jobId: 'e1' })
    await processEmbedJob(job)
    expect(spy).toHaveBeenCalledTimes(1)
    const req = spy.mock.calls[0][0]
    expect(req.team_id).toBe('t1')
    expect(req.source_types).toEqual(EMBED_SOURCE_TYPES)
    expect(req.source_types).toEqual(expect.arrayContaining(['transcript_chunk', 'summary', 'commitment', 'decision', 'action_item']))
    expect(req.since).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(req.created_by).toBe('auto:m1')
  })

  it('a nightly-sweep job (no meetingId, sinceDays 3) re-scans the wider window', async () => {
    spy.mockResolvedValue({ outcome: 'started', jobId: 'e2' })
    await processEmbedJob({ id: 's1', data: { teamId: 't1', sinceDays: 3 } })
    const req = spy.mock.calls[0][0]
    expect(req.created_by).toBe('auto:sweep')
    expect(req.since).toBe(sinceDate(new Date(), 3))
  })

  it('retries later when a job for the team is already running (throws a plain, retryable error)', async () => {
    spy.mockResolvedValue({ outcome: 'already_running' })
    const p = processEmbedJob(job)
    await expect(p).rejects.toThrow(/already running/)
    await expect(p).rejects.not.toBeInstanceOf(UnrecoverableError)
  })

  it('treats "RAG disabled on the AI service" as a no-op, not a failure', async () => {
    spy.mockResolvedValue({ outcome: 'disabled' })
    await expect(processEmbedJob(job)).resolves.toBeUndefined()
  })

  it('fails loudly and permanently on a rejected request (configuration problem)', async () => {
    spy.mockResolvedValue({ outcome: 'rejected', status: 400, code: 'RAG_VALIDATION_ERROR' })
    await expect(processEmbedJob(job)).rejects.toBeInstanceOf(UnrecoverableError)
  })

  it('lets network/5xx errors propagate so BullMQ retries', async () => {
    spy.mockRejectedValue(new Error('ECONNREFUSED'))
    await expect(processEmbedJob(job)).rejects.toThrow('ECONNREFUSED')
  })

  it('does nothing when RAG_AUTO_EMBED_ENABLED is false', async () => {
    mockEnv.RAG_AUTO_EMBED_ENABLED = false
    await processEmbedJob(job)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('AIPipelineClient.startEmbeddingBackfill outcome mapping', () => {
  const body = { team_id: 't1', source_types: ['summary'] as const }

  const clientWith = (post: jest.Mock): AIPipelineClient => {
    const c = new AIPipelineClient({
      baseUrl: 'http://ai.test', sharedSecret: 's'.repeat(40), timeoutMs: 1000,
      retryAttempts: 0, retryBaseDelayMs: 1, retryMaxDelayMs: 1,
    })
    ;(c as unknown as { axios: { post: jest.Mock } }).axios = { post }
    return c
  }
  const httpError = (status: number, error_code?: string) =>
    new AIPipelineNetworkError('x', { response: { status, data: { error_code } } } as never)

  it('202 → started with the job id', async () => {
    const c = clientWith(jest.fn().mockResolvedValue({ data: { job_id: 'abc' } }))
    await expect(c.startEmbeddingBackfill({ ...body, source_types: ['summary'] })).resolves.toEqual({ outcome: 'started', jobId: 'abc' })
  })

  it.each([
    [409, 'RAG_CONFLICT', { outcome: 'already_running' }],
    [503, 'RAG_DISABLED', { outcome: 'disabled' }],
    [400, 'RAG_VALIDATION_ERROR', { outcome: 'rejected', status: 400, code: 'RAG_VALIDATION_ERROR' }],
  ])('HTTP %i %s maps to a typed outcome', async (status, code, expected) => {
    const c = clientWith(jest.fn().mockRejectedValue(httpError(status, code)))
    await expect(c.startEmbeddingBackfill({ ...body, source_types: ['summary'] })).resolves.toEqual(expected)
  })

  it.each([
    ['a 503 that is NOT RAG_DISABLED (e.g. the RAG database is down)', httpError(503, 'RAG_UNAVAILABLE')],
    ['a 429', httpError(429, 'RAG_BUSY')],
    ['a 500', httpError(500)],
  ])('%s is thrown so the job is retried', async (_label, err) => {
    const c = clientWith(jest.fn().mockRejectedValue(err))
    await expect(c.startEmbeddingBackfill({ ...body, source_types: ['summary'] })).rejects.toBe(err)
  })
})
