/** Nightly embed sweep: which teams get a job, with what id/window, and that one bad enqueue cannot stop the rest. */

const mockEnv = { RAG_AUTO_EMBED_ENABLED: true }
const mockFindMany = jest.fn()
const mockAdd = jest.fn()

jest.mock('../../src/config/env', () => ({ env: mockEnv }))
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))
jest.mock('../../src/db/client', () => ({ prisma: { meeting: { findMany: (...a: unknown[]) => mockFindMany(...a) } } }))
jest.mock('../../src/queues/queue.client', () => ({ embedQueue: { add: (...a: unknown[]) => mockAdd(...a) } }))

import { runEmbedSweepCron, SWEEP_WINDOW_DAYS } from '../../src/queues/embed-sweep'

const NOW = new Date('2026-11-07T02:30:00Z')

beforeEach(() => {
  mockEnv.RAG_AUTO_EMBED_ENABLED = true
  mockFindMany.mockReset()
  mockAdd.mockReset().mockResolvedValue(undefined)
})

describe('runEmbedSweepCron', () => {
  it('looks only at meetings extracted inside the window, one row per team', async () => {
    mockFindMany.mockResolvedValue([])
    await runEmbedSweepCron(NOW)
    const arg = mockFindMany.mock.calls[0][0]
    expect(arg.where.status).toEqual({ in: ['EXTRACTED', 'EXTRACTED_PARTIAL'] })
    expect(arg.where.processingCompletedAt.gte).toEqual(new Date(NOW.getTime() - SWEEP_WINDOW_DAYS * 86_400_000))
    expect(arg.distinct).toEqual(['teamId'])
  })

  it('queues one deterministic, staggered job per team with the wide window and no meetingId', async () => {
    mockFindMany.mockResolvedValue([{ teamId: 'tA' }, { teamId: 'tB' }])
    const res = await runEmbedSweepCron(NOW)

    expect(res).toEqual({ teams: 2, enqueued: 2 })
    expect(mockAdd).toHaveBeenNthCalledWith(1, 'embed-sweep', { teamId: 'tA', sinceDays: SWEEP_WINDOW_DAYS },
      { jobId: 'embed-sweep-tA-20261107', delay: 0 })
    expect(mockAdd).toHaveBeenNthCalledWith(2, 'embed-sweep', { teamId: 'tB', sinceDays: SWEEP_WINDOW_DAYS },
      { jobId: 'embed-sweep-tB-20261107', delay: 5000 })
    expect(JSON.stringify(mockAdd.mock.calls)).not.toContain(':tA')   // BullMQ forbids ':' in custom job ids
  })

  it('keeps going when one team fails to enqueue', async () => {
    mockFindMany.mockResolvedValue([{ teamId: 'tA' }, { teamId: 'tB' }])
    mockAdd.mockRejectedValueOnce(new Error('redis blip')).mockResolvedValueOnce(undefined)
    await expect(runEmbedSweepCron(NOW)).resolves.toEqual({ teams: 2, enqueued: 1 })
  })

  it('does nothing when RAG_AUTO_EMBED_ENABLED is false', async () => {
    mockEnv.RAG_AUTO_EMBED_ENABLED = false
    await expect(runEmbedSweepCron(NOW)).resolves.toEqual({ teams: 0, enqueued: 0 })
    expect(mockFindMany).not.toHaveBeenCalled()
  })
})
