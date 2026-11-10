const add = jest.fn(async (_name: string, _data: object, opts: { jobId: string; delay?: number }) => ({ id: opts.jobId }))
const upsertJobScheduler = jest.fn(async () => undefined)

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add, upsertJobScheduler })),
}))
jest.mock('../../../src/config/redis.config', () => ({
  redisConnectionOptions: { host: 'localhost', port: 6379, password: undefined },
}))

import {
  enqueueRecomputeToday,
  enqueueRecomputeForBillingEvent,
  registerNightlyRollup,
  DEBOUNCE_MS,
} from '../../../src/queues/metrics-rollup.queue'

const log = { warn: jest.fn() }
beforeEach(() => jest.clearAllMocks())

describe('enqueueRecomputeToday (debounce)', () => {
  it('a burst inside one window shares ONE job id → BullMQ keeps exactly one job', async () => {
    const t = 1_700_000_000_000 - (1_700_000_000_000 % DEBOUNCE_MS) // window start
    for (let i = 0; i < 10; i++) await enqueueRecomputeToday(t + i * 500)
    const ids = new Set(add.mock.calls.map((c) => c[2].jobId))
    expect(ids.size).toBe(1)
  })

  it('an event in the NEXT window gets a new id (an event during a running job is never swallowed)', async () => {
    const t = 1_700_000_000_000 - (1_700_000_000_000 % DEBOUNCE_MS)
    await enqueueRecomputeToday(t + 1)
    await enqueueRecomputeToday(t + DEBOUNCE_MS + 1)
    const ids = add.mock.calls.map((c) => c[2].jobId)
    expect(ids[0]).not.toBe(ids[1])
  })

  it('delays the job by the debounce window', async () => {
    await enqueueRecomputeToday(0)
    expect(add.mock.calls[0]![2].delay).toBe(DEBOUNCE_MS)
  })
})

describe('enqueueRecomputeForBillingEvent', () => {
  it.each(['subscription.updated', 'transaction.completed', 'adjustment.created'])('enqueues for %s', async (type) => {
    await enqueueRecomputeForBillingEvent(type, log)
    expect(add).toHaveBeenCalledTimes(1)
  })

  it('ignores unrelated events', async () => {
    await enqueueRecomputeForBillingEvent('customer.updated', log)
    expect(add).not.toHaveBeenCalled()
  })

  it('NEVER throws when the enqueue fails — billing processing must be unaffected', async () => {
    add.mockRejectedValueOnce(new Error('redis down'))
    await expect(enqueueRecomputeForBillingEvent('subscription.updated', log)).resolves.toBeUndefined()
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ err: 'redis down' }), expect.any(String))
  })
})

describe('registerNightlyRollup', () => {
  it('registers a UTC 00:15 scheduler via the idempotent upsert API', async () => {
    await registerNightlyRollup()
    expect(upsertJobScheduler).toHaveBeenCalledWith('rollup-nightly', { pattern: '15 0 * * *', tz: 'UTC' }, expect.anything())
  })
})
