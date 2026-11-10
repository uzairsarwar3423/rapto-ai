/**
 * Transcript translation (full + per-speaker): scope isolation, segment-level cache, hash invalidation,
 * script-based skipping, speaker validation, tenant isolation, concurrency, partial/failed results,
 * chunking, and original-transcript immutability. prisma / redis / mongo / pipeline are mocked.
 */

const mockMeetingFindFirst = jest.fn()
const mockMeetingFindUnique = jest.fn()
const mockExecuteRaw = jest.fn()
const mockRedisSet = jest.fn()
const mockRedisDel = jest.fn()
const mockRedisExists = jest.fn()
const mockTranslate = jest.fn()
const mockFindTranscript = jest.fn()
const mockUpdateTranscript = jest.fn()

jest.mock('../../src/db/client', () => ({
  prisma: {
    meeting: { findFirst: mockMeetingFindFirst, findUnique: mockMeetingFindUnique },
    $executeRaw: mockExecuteRaw,
  },
}))
jest.mock('../../src/config/redis', () => ({
  redis: { set: mockRedisSet, del: mockRedisDel, exists: mockRedisExists },
}))
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))
jest.mock('../../src/services/mongo.service', () => ({
  mongoService: { findTranscript: mockFindTranscript, updateTranscript: mockUpdateTranscript },
}))
jest.mock('../../src/services/ai-pipeline/ai-pipeline.client', () => ({
  aipipelineClient: { translate: mockTranslate },
}))

import {
  getTranscriptTranslation,
  needsTranslation,
} from '../../src/modules/meetings/meetings.transcript-translation.service'

const TURNS = [
  { turn_id: 't0', speaker_name: 'Sarah', cleaned_text: "Let's discuss the project deadline.", start_time: 1, end_time: 4 },
  { turn_id: 't1', speaker_name: 'Ahmed', cleaned_text: 'ہمیں یہ کام جمعہ تک مکمل کرنا ہوگا۔', start_time: 5, end_time: 9 },
  { turn_id: 't2', speaker_name: 'John', cleaned_text: 'We should review the final implementation.', start_time: 10, end_time: 13 },
  { turn_id: 't3', speaker_name: 'Ahmed', cleaned_text: 'ہمیں کل تک API integration complete کرنی ہے۔', start_time: 14, end_time: 18 },
]

let store: Record<string, any> | null
function row() {
  return { id: 'm1', title: 'Sprint sync', summary: null, language: 'en', mongoTranscriptId: 'mongo1', translations: store }
}

/** Emulates the atomic SQL merge: the JSON-string arg holds the new segments. */
function applyWrite(args: any[]) {
  const segs = JSON.parse(args.find((a) => typeof a === 'string' && a.startsWith('{"')))
  const key = args.find((a) => typeof a === 'string' && a.startsWith('transcript:'))
  store = { ...(store ?? {}) }
  store[key] = { ...(store[key] ?? {}), segments: { ...(store[key]?.segments ?? {}), ...segs } }
}

beforeEach(() => {
  jest.clearAllMocks()
  store = null
  mockRedisSet.mockResolvedValue('OK')
  mockRedisDel.mockResolvedValue(1)
  mockRedisExists.mockResolvedValue(0)
  mockMeetingFindFirst.mockImplementation(async () => row())
  mockMeetingFindUnique.mockImplementation(async () => ({ translations: store }))
  mockFindTranscript.mockResolvedValue({ normalized_transcript: TURNS, raw_transcript: [] })
  mockExecuteRaw.mockImplementation(async (_s: any, ...args: any[]) => applyWrite(args))
  mockTranslate.mockImplementation(async (req: any) => ({
    items: req.items.map((i: any) => ({ key: i.key, text: `T(${i.text})` })),
    missing_keys: [],
    model: 'gpt-test',
  }))
})

const sentKeys = () => mockTranslate.mock.calls.flatMap((c) => c[0].items.map((i: any) => i.key))

describe('needsTranslation (script census)', () => {
  it('skips text already in the target script, translates the rest', () => {
    expect(needsTranslation('We should review it', 'en')).toBe(false)
    expect(needsTranslation('ہمیں یہ کام مکمل کرنا ہے', 'en')).toBe(true)
    expect(needsTranslation('ہمیں یہ کام مکمل کرنا ہے', 'ur')).toBe(false)
    expect(needsTranslation('ہمیں یہ کام مکمل کرنا ہے', 'hi')).toBe(true)
    expect(needsTranslation('हमें यह काम पूरा करना है', 'ur')).toBe(true)
    expect(needsTranslation('We should review it', 'ur')).toBe(true)
    expect(needsTranslation('ہمیں کل تک API integration complete کرنی ہے', 'ur')).toBe(true) // mixed
    expect(needsTranslation('12:30 - 5', 'ur')).toBe(false)
  })
})

describe('full transcript', () => {
  it('translates only segments not already in the target language, keyed by segment id', async () => {
    const res = await getTranscriptTranslation({ meetingId: 'm1', teamId: 'tm', target: 'en' })
    expect(sentKeys().sort()).toEqual(['t1', 't3'])
    expect(res.segments).toEqual({
      t1: 'T(ہمیں یہ کام جمعہ تک مکمل کرنا ہوگا۔)',
      t3: 'T(ہمیں کل تک API integration complete کرنی ہے۔)',
    })
    expect(res.scope).toBe('full')
    expect(res.cached).toBe(false)
    expect(mockTranslate.mock.calls[0][0].content_type).toBe('transcript')
  })

  it('never writes the original transcript', async () => {
    await getTranscriptTranslation({ meetingId: 'm1', teamId: 'tm', target: 'ur' })
    expect(mockUpdateTranscript).not.toHaveBeenCalled()
    const sql = (mockExecuteRaw.mock.calls[0][0] as TemplateStringsArray).join('?')
    expect(sql).toContain('"translations"')
    expect(sql).not.toMatch(/"summary"\s*=/)
  })

  it('reuses the cache: a repeat request makes no pipeline call', async () => {
    await getTranscriptTranslation({ meetingId: 'm1', teamId: 'tm', target: 'en' })
    mockTranslate.mockClear()
    const again = await getTranscriptTranslation({ meetingId: 'm1', teamId: 'tm', target: 'en' })
    expect(mockTranslate).not.toHaveBeenCalled()
    expect(again.cached).toBe(true)
    expect(Object.keys(again.segments).sort()).toEqual(['t1', 't3'])
  })

  it('invalidates only the segment whose text changed', async () => {
    await getTranscriptTranslation({ meetingId: 'm1', teamId: 'tm', target: 'en' })
    mockTranslate.mockClear()
    const edited = TURNS.map((t) =>
      t.turn_id === 't1' ? { ...t, cleaned_text: 'ہمیں یہ کام پیر تک مکمل کرنا ہوگا۔' } : t
    )
    mockFindTranscript.mockResolvedValue({ normalized_transcript: edited })
    const res = await getTranscriptTranslation({ meetingId: 'm1', teamId: 'tm', target: 'en' })
    expect(sentKeys()).toEqual(['t1'])
    expect(res.segments.t1).toContain('پیر')
    expect(res.segments.t3).toBeDefined()
  })

  it('tenant isolation: a meeting of another team is a 404 and nothing is read or sent', async () => {
    mockMeetingFindFirst.mockResolvedValue(null)
    await expect(
      getTranscriptTranslation({ meetingId: 'm1', teamId: 'other', target: 'en' })
    ).rejects.toMatchObject({ statusCode: 404 })
    expect(mockFindTranscript).not.toHaveBeenCalled()
    expect(mockTranslate).not.toHaveBeenCalled()
  })

  it('422 when everything is already in the target language', async () => {
    mockFindTranscript.mockResolvedValue({ normalized_transcript: [TURNS[0], TURNS[2]] })
    await expect(
      getTranscriptTranslation({ meetingId: 'm1', teamId: 'tm', target: 'en' })
    ).rejects.toMatchObject({ code: 'ALREADY_IN_TARGET_LANGUAGE' })
  })
})

describe('speaker scope', () => {
  it("sends and returns ONLY that speaker's segments; other speakers' text is never an item", async () => {
    const res = await getTranscriptTranslation({ meetingId: 'm1', teamId: 'tm', target: 'en', speaker: 'Ahmed' })
    const req = mockTranslate.mock.calls[0][0]
    expect(sentKeys().sort()).toEqual(['t1', 't3'])
    const itemText = req.items.map((i: any) => i.text).join(' ')
    expect(itemText).not.toContain('project deadline')
    expect(req.context).toContain('Ahmed')
    expect(Object.keys(res.segments).sort()).toEqual(['t1', 't3'])
    expect(res.scope).toBe('speaker')
  })

  it('rejects a speaker that is not in this meeting transcript (404)', async () => {
    await expect(
      getTranscriptTranslation({ meetingId: 'm1', teamId: 'tm', target: 'en', speaker: 'Mallory' })
    ).rejects.toMatchObject({ statusCode: 404 })
    expect(mockTranslate).not.toHaveBeenCalled()
  })

  it('speaker translation warms the cache for the later full translation (no duplicate calls)', async () => {
    await getTranscriptTranslation({ meetingId: 'm1', teamId: 'tm', target: 'en', speaker: 'Ahmed' })
    mockTranslate.mockClear()
    const full = await getTranscriptTranslation({ meetingId: 'm1', teamId: 'tm', target: 'en' })
    expect(mockTranslate).not.toHaveBeenCalled()
    expect(Object.keys(full.segments).sort()).toEqual(['t1', 't3'])
  })

  it('concurrent translations of two different speakers both succeed and keep each others cache', async () => {
    mockFindTranscript.mockResolvedValue({
      normalized_transcript: [
        ...TURNS,
        { turn_id: 't4', speaker_name: 'Sara', cleaned_text: 'مجھے یہ رپورٹ کل چاہیے', start_time: 20, end_time: 22 },
      ],
    })
    const [a, b] = await Promise.all([
      getTranscriptTranslation({ meetingId: 'm1', teamId: 'tm', target: 'en', speaker: 'Ahmed' }),
      getTranscriptTranslation({ meetingId: 'm1', teamId: 'tm', target: 'en', speaker: 'Sara' }),
    ])
    expect(Object.keys(a.segments).sort()).toEqual(['t1', 't3'])
    expect(Object.keys(b.segments)).toEqual(['t4'])
    expect(Object.keys(store!['transcript:en'].segments).sort()).toEqual(['t1', 't3', 't4'])
  })

  it('identical concurrent requests share one pipeline call', async () => {
    const [a, b] = await Promise.all([
      getTranscriptTranslation({ meetingId: 'm1', teamId: 'tm', target: 'en', speaker: 'Ahmed' }),
      getTranscriptTranslation({ meetingId: 'm1', teamId: 'tm', target: 'en', speaker: 'Ahmed' }),
    ])
    expect(mockTranslate).toHaveBeenCalledTimes(1)
    expect(a.segments).toEqual(b.segments)
  })
})

describe('failures, partials and chunking', () => {
  it('pipeline failure -> 502 TRANSLATION_FAILED, nothing cached, lock released, retry works', async () => {
    mockTranslate.mockRejectedValue(new Error('boom'))
    await expect(
      getTranscriptTranslation({ meetingId: 'm1', teamId: 'tm', target: 'en' })
    ).rejects.toMatchObject({ code: 'TRANSLATION_FAILED', statusCode: 502 })
    expect(store).toBeNull()
    expect(mockRedisDel).toHaveBeenCalled()

    mockTranslate.mockImplementation(async (req: any) => ({
      items: req.items.map((i: any) => ({ key: i.key, text: 'ok' })),
      missing_keys: [],
      model: 'm',
    }))
    const res = await getTranscriptTranslation({ meetingId: 'm1', teamId: 'tm', target: 'en' })
    expect(res.partial).toBe(false)
  })

  it('dropped keys -> partial result, only translated ones cached, retry pays only for the rest', async () => {
    mockTranslate.mockImplementationOnce(async (req: any) => ({
      items: req.items.filter((i: any) => i.key === 't1').map((i: any) => ({ key: i.key, text: 'one' })),
      missing_keys: ['t3'],
      model: 'm',
    }))
    const first = await getTranscriptTranslation({ meetingId: 'm1', teamId: 'tm', target: 'en' })
    expect(first.partial).toBe(true)
    expect(Object.keys(first.segments)).toEqual(['t1'])

    mockTranslate.mockClear()
    const second = await getTranscriptTranslation({ meetingId: 'm1', teamId: 'tm', target: 'en' })
    expect(sentKeys()).toEqual(['t3'])
    expect(second.partial).toBe(false)
  })

  it('long transcripts are chunked; every segment sent exactly once', async () => {
    const many = Array.from({ length: 300 }, (_, i) => ({
      turn_id: `u${i}`,
      speaker_name: 'Ahmed',
      cleaned_text: `یہ نمبر ${i} کی بات ہے جو ہمیں کرنی ہے`,
      start_time: i,
      end_time: i + 1,
    }))
    mockFindTranscript.mockResolvedValue({ normalized_transcript: many })
    const res = await getTranscriptTranslation({ meetingId: 'm1', teamId: 'tm', target: 'en' })
    expect(mockTranslate.mock.calls.length).toBeGreaterThan(1)
    const keys = sentKeys()
    expect(keys).toHaveLength(300)
    expect(new Set(keys).size).toBe(300)
    expect(res.translatedCount).toBe(300)
  })

  it('raw-transcript meetings (no cleanup, no turn ids) use stable turn-N ids', async () => {
    mockFindTranscript.mockResolvedValue({
      normalized_transcript: [],
      raw_transcript: [{ speaker: 'Ahmed', text: 'ہمیں یہ کام جمعہ تک مکمل کرنا ہوگا۔' }],
    })
    const res = await getTranscriptTranslation({ meetingId: 'm1', teamId: 'tm', target: 'en' })
    expect(Object.keys(res.segments)).toEqual(['turn-0'])
  })
})
