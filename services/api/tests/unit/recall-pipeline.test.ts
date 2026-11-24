// ─────────────────────────────────────────────────────────────────────────────
// recall-pipeline.test.ts — Recall.ai webhook → transcript → extraction correctness
//
// Fixtures follow the documented Recall.ai shapes:
//   status events   https://docs.recall.ai/docs/bot-status-change-events
//   artifact events https://docs.recall.ai/docs/recording-webhooks
//   transcript JSON https://docs.recall.ai/docs/download-schemas
// Prisma, MongoDB, Redis, BullMQ and the Recall/AI-pipeline HTTP clients are
// in-memory stand-ins — nothing external is contacted.
// ─────────────────────────────────────────────────────────────────────────────
import '../support/team-slug-test-env'
import { Webhook } from 'svix'

const SECRET = 'whsec_' + Buffer.from('recall-test-secret-recall-test-secret').toString('base64')
process.env.RECALL_WEBHOOK_SECRET = SECRET

// ── In-memory stand-ins ──────────────────────────────────────────────────────
const meetings = new Map<string, any>()
const mongoDocs = new Map<string, any>()
const transcribeAdds: any[] = []
const statusUpdates: Array<{ id: string; status: string; extra?: any }> = []
let recallTranscript: any[] | Error = []

const prismaMock: any = {
  meeting: {
    findFirst: jest.fn(async ({ where }: any) => [...meetings.values()].find((m) => m.recallBotId === where.recallBotId) ?? null),
    findUnique: jest.fn(async ({ where }: any) => meetings.get(where.id) ?? null),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const m = meetings.get(where.id)
      if (!m || (where.status?.in && !where.status.in.includes(m.status))) return { count: 0 }
      Object.assign(m, data)
      return { count: 1 }
    }),
    update: jest.fn(async ({ where, data }: any) => Object.assign(meetings.get(where.id), data)),
  },
  user: { findMany: jest.fn(async () => []) },
  team: { findUnique: jest.fn(async () => ({ settings: {} })) },
  commitment: { createMany: jest.fn(async () => ({ count: 0 })) },
  actionItem: { createMany: jest.fn(async () => ({ count: 0 })) },
  decision: { createMany: jest.fn(async () => ({ count: 0 })) },
  blocker: { createMany: jest.fn(async () => ({ count: 0 })) },
  risk: { createMany: jest.fn(async () => ({ count: 0 })) },
  $transaction: jest.fn(async (fn: any) => fn(prismaMock)),
}
jest.mock('../../src/db/client', () => ({ prisma: prismaMock }))
jest.mock('../../src/config/redis', () => ({ redis: require('../support/fake-redis').createFakeRedis() }))
jest.mock('../../src/services/mongo.service', () => ({
  mongoService: {
    storeTranscript: jest.fn(async (doc: any) => {
      const id = `mongo_${mongoDocs.size + 1}`
      mongoDocs.set(id, { ...doc })
      return id
    }),
    findTranscript: jest.fn(async (id: string) => mongoDocs.get(id) ?? null),
    updateTranscript: jest.fn(async (id: string, data: any) => void Object.assign(mongoDocs.get(id), data)),
  },
}))
jest.mock('../../src/queues/queue.client', () => {
  // BullMQ semantics that matter here: a second add with an existing jobId is ignored.
  const ids = new Set<string>()
  const add = (queue: string) => jest.fn(async (name: string, data: any, opts: any = {}) => {
    if (opts.jobId && ids.has(`${queue}:${opts.jobId}`)) return { id: opts.jobId }
    if (opts.jobId) ids.add(`${queue}:${opts.jobId}`)
    if (queue === 'transcribe') transcribeAdds.push({ name, data, opts })
    return { id: opts.jobId ?? 'job' }
  })
  return {
    transcribeQueue: { add: add('transcribe') },
    notifyQueue: { add: add('notify') },
    resolveQueue: { add: add('resolve') },
    embedQueue: { add: add('embed') },
    extractQueue: { add: add('extract') },
    __resetJobIds: () => ids.clear(),
  }
})
jest.mock('../../src/modules/meetings/meetings.service', () => ({
  updateMeetingStatus: jest.fn(async (id: string, status: string, extra?: any) => {
    const { validateTransition } = jest.requireActual('../../src/modules/meetings/meetings.service.state')
    const m = meetings.get(id)
    validateTransition(m.status, status)
    Object.assign(m, { status }, extra)
    statusUpdates.push({ id, status, extra })
    return m
  }),
}))
jest.mock('../../src/services/recall.service', () => ({
  getTranscript: jest.fn(async () => {
    if (recallTranscript instanceof Error) throw recallTranscript
    return recallTranscript
  }),
}))
jest.mock('../../src/realtime/socket.emitter', () => ({ socketEmitter: { to: () => ({ emit: jest.fn() }) } }))

// extract.worker builds a BullMQ Worker at import — capture its processor instead.
const processors: Record<string, (job: any) => Promise<unknown>> = {}
jest.mock('bullmq', () => ({
  Worker: class {
    constructor(name: string, fn: any) { processors[name] = fn }
    on() { return this }
  },
  DelayedError: class extends Error {},
}))
const aiExtract = jest.fn()
jest.mock('../../src/services/ai-pipeline/ai-pipeline.client', () => ({
  aipipelineClient: { extract: (...a: any[]) => aiExtract(...a), cleanup: jest.fn() },
}))
jest.mock('../../src/modules/action-items/action-items.service', () => ({
  actionItemsService: { enqueueAutoSyncJobs: jest.fn(async () => ({ enqueuedCount: 0 })) },
}))

import { handleRecallWebhook } from '../../src/modules/webhooks/recall.webhook'
import { normalizeRecallTranscript } from '../../src/services/recall-transcript'
import '../../src/queues/workers/extract.worker'

// ── Helpers ──────────────────────────────────────────────────────────────────
const RECALL_SEGMENTS = [
  {
    participant: { id: 100, name: 'Alice Chen', is_host: true, platform: 'zoom', extra_data: null, email: null },
    language_code: 'en',
    words: [
      { text: 'I', start_timestamp: { relative: 12.5, absolute: null }, end_timestamp: { relative: 12.7, absolute: null } },
      { text: 'will', start_timestamp: { relative: 12.7, absolute: null }, end_timestamp: { relative: 13.0, absolute: null } },
      { text: 'ship', start_timestamp: { relative: 13.0, absolute: null }, end_timestamp: { relative: 13.4, absolute: null } },
      { text: 'Friday.', start_timestamp: { relative: 13.4, absolute: null }, end_timestamp: { relative: 14.1, absolute: null } },
    ],
  },
  { participant: { id: 101, name: 'Bob', is_host: false, platform: 'zoom', extra_data: null, email: null }, language_code: 'en', words: [] },
  {
    participant: { id: 101, name: 'Bob', is_host: false, platform: 'zoom', extra_data: null, email: null },
    language_code: 'en',
    words: [
      { text: 'Sounds', start_timestamp: { relative: 75.2, absolute: null }, end_timestamp: { relative: 75.6, absolute: null } },
      { text: 'good.', start_timestamp: { relative: 75.6, absolute: null }, end_timestamp: { relative: 76.0, absolute: null } },
    ],
  },
]

function signedRequest(body: object, headerStyle: 'webhook' | 'svix' = 'webhook') {
  const raw = JSON.stringify(body)
  const id = `msg_${Math.random().toString(36).slice(2)}`
  const now = new Date()
  const signature = new Webhook(SECRET).sign(id, now, raw)
  const ts = String(Math.floor(now.getTime() / 1000))
  const headers: Record<string, string> =
    headerStyle === 'webhook'
      ? { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': signature }
      : { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': signature }
  return { body, rawBody: Buffer.from(raw), headers } as any
}
async function deliver(event: string, botId: string, extra: object = {}, headerStyle?: 'webhook' | 'svix') {
  const res: any = { statusCode: 0, status(c: number) { this.statusCode = c; return this }, json() { return this } }
  await handleRecallWebhook(
    signedRequest({ event, data: { data: { code: event.split('.')[1], sub_code: null, updated_at: new Date().toISOString() }, bot: { id: botId, metadata: {} }, ...extra } }, headerStyle),
    res
  )
  return res.statusCode as number
}
function addMeeting(overrides: object = {}): any {
  const m: any = { id: `m_${meetings.size + 1}`, teamId: 't1', recallBotId: `bot_${meetings.size + 1}`, status: 'RECORDING', startedAt: new Date(Date.now() - 600_000), mongoTranscriptId: null, platform: 'ZOOM', ...overrides }
  meetings.set(m.id, m)
  return m
}

beforeEach(async () => {
  meetings.clear()
  mongoDocs.clear()
  transcribeAdds.length = 0
  statusUpdates.length = 0
  recallTranscript = []
  require('../../src/queues/queue.client').__resetJobIds()
  const { redis } = require('../../src/config/redis')
  redis._store.clear()
  aiExtract.mockReset()
  jest.clearAllMocks()
})

// ── normalizeRecallTranscript ────────────────────────────────────────────────
describe('normalizeRecallTranscript (documented Recall.ai transcript format)', () => {
  it('reads relative timestamps from timestamp objects, joins words, keeps speakers, drops empty segments', () => {
    expect(normalizeRecallTranscript(RECALL_SEGMENTS)).toEqual([
      { speaker: 'Alice Chen', text: 'I will ship Friday.', startTime: 12.5, endTime: 14.1, language: 'en' },
      { speaker: 'Bob', text: 'Sounds good.', startTime: 75.2, endTime: 76.0, language: 'en' },
    ])
  })

  it('still accepts flat numeric timestamps (simulated / older payloads)', () => {
    expect(normalizeRecallTranscript([{ speaker_tag: 'Speaker 1', text: 'Hi', start_time: 0, end_time: 4 }])).toEqual([
      { speaker: 'Speaker 1', text: 'Hi', startTime: 0, endTime: 4, language: 'unknown' },
    ])
  })
})

// ── Webhook handling ─────────────────────────────────────────────────────────
describe('Recall.ai webhook', () => {
  it('accepts both webhook-* and legacy svix-* signature headers, rejects a bad signature', async () => {
    const m = addMeeting({ status: 'SCHEDULED' })
    expect(await deliver('bot.joining_call', m.recallBotId, {}, 'svix')).toBe(200)
    expect(m.status).toBe('BOT_JOINING')
    expect(await deliver('bot.in_call_recording', m.recallBotId, {}, 'webhook')).toBe(200)
    expect(m.status).toBe('RECORDING')

    const bad = signedRequest({ event: 'bot.done', data: { bot: { id: m.recallBotId } } })
    bad.headers['webhook-signature'] = 'v1,AAAA'
    const res: any = { status(c: number) { this.code = c; return this }, json() { return this } }
    await handleRecallWebhook(bad, res)
    expect(res.code).toBe(400)
  })

  it('bot.fatal (the documented failure event) marks the meeting FAILED with its sub_code', async () => {
    const m = addMeeting({ status: 'BOT_JOINING' })
    const req = signedRequest({
      event: 'bot.fatal',
      data: { data: { code: 'fatal', sub_code: 'meeting_not_found', updated_at: '' }, bot: { id: m.recallBotId, metadata: {} } },
    })
    const res: any = { status(c: number) { this.code = c; return this }, json() { return this } }
    await handleRecallWebhook(req, res)
    expect(res.code).toBe(200)
    expect(m.status).toBe('FAILED')
    expect(m.processingError).toBe('meeting_not_found')
  })

  it('bot.done with the transcript ready stores it and starts processing once; a later transcript.done is a no-op', async () => {
    const m = addMeeting()
    recallTranscript = RECALL_SEGMENTS
    expect(await deliver('bot.done', m.recallBotId)).toBe(200)
    expect(m.status).toBe('PROCESSING')
    expect(transcribeAdds).toHaveLength(1)
    const doc = mongoDocs.get(m.mongoTranscriptId)
    expect(doc.normalized_transcript[0]).toMatchObject({ startTime: 12.5, text: 'I will ship Friday.' })
    expect(doc.full_text).toContain('Alice Chen [00:12]: I will ship Friday.')

    doc.normalized_transcript = [{ cleaned: true }] // simulate cleanup having run
    expect(await deliver('transcript.done', m.recallBotId)).toBe(200)
    expect(transcribeAdds).toHaveLength(1)
    expect(mongoDocs.get(m.mongoTranscriptId).normalized_transcript).toEqual([{ cleaned: true }])
  })

  it('bot.done before the transcript exists waits; transcript.done then ingests and enqueues exactly once', async () => {
    const m = addMeeting()
    recallTranscript = []
    expect(await deliver('bot.done', m.recallBotId)).toBe(200)
    expect(m.status).toBe('PROCESSING')
    expect(transcribeAdds).toHaveLength(0)

    recallTranscript = RECALL_SEGMENTS
    expect(await deliver('transcript.done', m.recallBotId)).toBe(200)
    expect(transcribeAdds).toHaveLength(1)
    expect(transcribeAdds[0].opts.jobId).toBe(`recall-transcript-${m.id}`)
    expect(mongoDocs.get(m.mongoTranscriptId).raw_transcript).toHaveLength(3)
  })

  it('a failed transcript download answers 5xx and releases the claim so Recall.ai redelivers', async () => {
    const m = addMeeting()
    await deliver('bot.done', m.recallBotId)

    recallTranscript = new Error('S3 timeout')
    expect(await deliver('transcript.done', m.recallBotId)).toBe(500)
    expect(transcribeAdds).toHaveLength(0)

    recallTranscript = RECALL_SEGMENTS
    expect(await deliver('transcript.done', m.recallBotId)).toBe(200) // the retry is processed
    expect(transcribeAdds).toHaveLength(1)
    expect(await deliver('transcript.done', m.recallBotId)).toBe(200) // a true duplicate is skipped
    expect(transcribeAdds).toHaveLength(1)
  })

  it('transcript.done arriving before bot.done is retried rather than dropped', async () => {
    const m = addMeeting()
    recallTranscript = RECALL_SEGMENTS
    expect(await deliver('transcript.done', m.recallBotId)).toBe(500)
    expect(await deliver('bot.done', m.recallBotId)).toBe(200)
    expect(transcribeAdds).toHaveLength(1)
    expect(await deliver('transcript.done', m.recallBotId)).toBe(200)
    expect(transcribeAdds).toHaveLength(1)
  })

  it('a bot.done fetch failure does not block recording that the meeting ended', async () => {
    const m = addMeeting()
    recallTranscript = new Error('Recall 503')
    expect(await deliver('bot.done', m.recallBotId)).toBe(200)
    expect(m.status).toBe('PROCESSING')
    expect(transcribeAdds).toHaveLength(0)
  })

  it('transcript.failed fails a meeting that has no transcript', async () => {
    const m = addMeeting()
    await deliver('bot.done', m.recallBotId)
    const req = signedRequest({
      event: 'transcript.failed',
      data: { data: { code: 'failed', sub_code: 'provider_error', updated_at: '' }, bot: { id: m.recallBotId, metadata: {} }, transcript: { id: 'tr_1', metadata: {} } },
    })
    const res: any = { status(c: number) { this.code = c; return this }, json() { return this } }
    await handleRecallWebhook(req, res)
    expect(m.status).toBe('FAILED')
    expect(m.processingError).toBe('Transcription failed: provider_error')
  })

  it('out-of-order status events never regress or throw', async () => {
    const m = addMeeting({ status: 'RECORDING' })
    expect(await deliver('bot.joining_call', m.recallBotId)).toBe(200)
    expect(m.status).toBe('RECORDING')
  })
})

// ── Extract worker exactly-once ───────────────────────────────────────────────
describe('extract.worker idempotency and degraded mode', () => {
  const extractResult = {
    commitments: [{ text: 'Ship Friday', owner_name: 'Alice Chen', confidence: 0.9, due_date_raw: 'Friday', due_date_utc: null, normalized_text: 'ship friday', dedup_key: 'k' }],
    action_items: [], decisions: [], blockers: [], risks: [],
    summary: 'Alice will ship Friday.', detected_language: 'en', extraction_model: 'm', prompt_version: 'v',
    total_cost: { estimated_cost_usd: 0 }, chunks_total: 1, chunks_succeeded: 1, processing_time_ms: 1,
  }
  function setup(status: string, normalized: any[], cleanupSuccessful = false) {
    const m = addMeeting({ status, participants: [], title: 'Sync', scheduledAt: new Date(), durationMinutes: 30 })
    mongoDocs.set('doc', { normalized_transcript: normalized, cleanup_successful: cleanupSuccessful })
    return { m, job: { id: 'j', data: { meetingId: m.id, teamId: 't1', mongoTranscriptId: 'doc' } } }
  }

  it('degraded mode sends real text, speakers and timestamps (not empty raw segments)', async () => {
    const { job } = setup('TRANSCRIPT_CLEANUP_FAILED', normalizeRecallTranscript(RECALL_SEGMENTS))
    aiExtract.mockResolvedValue(extractResult)
    await processors.extract(job)
    const turns = aiExtract.mock.calls[0][0].cleaned_transcript
    expect(turns.map((t: any) => [t.speaker_name, t.cleaned_text, t.start_time])).toEqual([
      ['Alice Chen', 'I will ship Friday.', 12.5],
      ['Bob', 'Sounds good.', 75.2],
    ])
  })

  it('re-normalizes raw Recall.ai segments left in older degraded documents', async () => {
    const { job } = setup('TRANSCRIPT_CLEANUP_FAILED', RECALL_SEGMENTS)
    aiExtract.mockResolvedValue(extractResult)
    await processors.extract(job)
    expect(aiExtract.mock.calls[0][0].cleaned_transcript[0].cleaned_text).toBe('I will ship Friday.')
  })

  it('writes results once; a retry/duplicate after success neither calls the LLM nor inserts again', async () => {
    const { m, job } = setup('TRANSCRIPT_CLEANED', [{ turn_id: 't', cleaned_text: 'x', speaker_name: 'A' }], true)
    aiExtract.mockResolvedValue(extractResult)
    await processors.extract(job)
    expect(m.status).toBe('EXTRACTED')
    expect(prismaMock.commitment.createMany).toHaveBeenCalledTimes(1)

    await processors.extract(job)
    expect(aiExtract).toHaveBeenCalledTimes(1)
    expect(prismaMock.commitment.createMany).toHaveBeenCalledTimes(1)
  })

  it('two concurrent runs store results only once', async () => {
    const { m, job } = setup('TRANSCRIPT_CLEANED', [{ turn_id: 't', cleaned_text: 'x', speaker_name: 'A' }], true)
    aiExtract.mockResolvedValue(extractResult)
    // Both pass the pre-check; the claim inside the transaction lets one write.
    await Promise.all([processors.extract(job), processors.extract({ ...job, id: 'j2' })])
    expect(m.status).toBe('EXTRACTED')
    expect(prismaMock.commitment.createMany).toHaveBeenCalledTimes(1)
  })
})

// ── Transcribe worker ─────────────────────────────────────────────────────────
describe('transcribe.worker cleanup input and fallback', () => {
  it('sends only segments with spoken words to cleanup, and falls back to normalized turns when cleanup fails', async () => {
    require('../../src/queues/workers/transcribe.worker')
    prismaMock.meetingParticipant = {
      findMany: jest.fn(async () => []),
      createMany: jest.fn(async () => ({ count: 0 })),
    }
    const { aipipelineClient } = require('../../src/services/ai-pipeline/ai-pipeline.client')
    aipipelineClient.cleanup.mockRejectedValue(new Error('AI pipeline unavailable'))

    const m = addMeeting({ status: 'PROCESSING' })
    mongoDocs.set('doc', { raw_transcript: RECALL_SEGMENTS, normalized_transcript: normalizeRecallTranscript(RECALL_SEGMENTS) })
    await processors.transcribe({ id: 'tj', data: { meetingId: m.id, teamId: 't1', mongoTranscriptId: 'doc' } })

    const sent = aipipelineClient.cleanup.mock.calls[0][0].raw_transcript
    expect(sent).toHaveLength(2) // Bob's empty segment would make the pipeline reject the whole request
    const doc = mongoDocs.get('doc')
    expect(doc.cleanup_successful).toBe(false)
    expect(doc.normalized_transcript).toEqual(normalizeRecallTranscript(RECALL_SEGMENTS))
    expect(m.status).toBe('TRANSCRIPT_CLEANUP_FAILED')
  })
})
