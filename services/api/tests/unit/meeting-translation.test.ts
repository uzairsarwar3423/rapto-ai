/**
 * On-demand meeting translation: cache reuse, hash invalidation, concurrency de-dup, partial/failed results,
 * tenant isolation, original-data immutability, and the legacy-language fallback.
 * prisma, redis, the AI pipeline client and the logger are mocked — nothing touches a database or the network.
 */

const mockMeetingFindFirst = jest.fn()
const mockMeetingFindUnique = jest.fn()
const mockExecuteRaw = jest.fn()
const mockRedisSet = jest.fn()
const mockRedisDel = jest.fn()
const mockRedisExists = jest.fn()
const mockTranslate = jest.fn()

jest.mock('../../src/db/client', () => ({
  prisma: {
    meeting: { findFirst: mockMeetingFindFirst, findUnique: mockMeetingFindUnique, update: jest.fn() },
    $executeRaw: mockExecuteRaw,
  },
}))
jest.mock('../../src/config/redis', () => ({
  redis: { set: mockRedisSet, del: mockRedisDel, exists: mockRedisExists },
}))
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))
jest.mock('../../src/services/ai-pipeline/ai-pipeline.client', () => ({
  aipipelineClient: { translate: mockTranslate },
}))

import { getMeetingTranslation } from '../../src/modules/meetings/meetings.translation.service'
import { detectLanguageFromText } from '../../src/utils/language'

const URDU_SUMMARY = {
  meeting_purpose: 'ہم نے رپورٹ پر بات کی',
  overview: 'ٹیم نے ڈیپلائمنٹ کا جائزہ لیا اور تاریخ طے کی',
  key_takeaways: ['ڈیپلائمنٹ جمعرات کو ہوگی', 'ٹیسٹنگ احمد دیکھے گا'],
  topics_discussed: [{ topic: 'ڈیپلائمنٹ', bullets: ['اسٹیجنگ تیار ہے', 'QA باقی ہے'] }],
  conclusions: ['منصوبہ منظور'],
  decisions: ['جمعرات کو ریلیز'],
}

function meetingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    teamId: 't1',
    summary: JSON.stringify(URDU_SUMMARY),
    language: 'ur',
    translations: null,
    actionItems: [{ id: 'a1', text: 'میں رپورٹ بھیجوں گا' }],
    commitments: [{ id: 'c1', text: 'احمد ٹیسٹنگ مکمل کرے گا' }],
    ...overrides,
  }
}

/** Echo translator: "EN(" + original + ")" for every key; optionally drops keys. */
function echoTranslate(drop: (key: string) => boolean = () => false) {
  mockTranslate.mockImplementation(async (req: any) => ({
    meeting_id: req.meeting_id,
    source_language: req.source_language,
    target_language: req.target_language,
    items: req.items.filter((i: any) => !drop(i.key)).map((i: any) => ({ key: i.key, text: `EN(${i.text})` })),
    missing_keys: req.items.filter((i: any) => drop(i.key)).map((i: any) => i.key),
    model: 'gpt-test',
    total_cost: { estimated_cost_usd: 0.001 },
    processing_time_ms: 5,
  }))
}

beforeEach(() => {
  jest.clearAllMocks()
  mockRedisSet.mockResolvedValue('OK')
  mockRedisDel.mockResolvedValue(1)
  mockRedisExists.mockResolvedValue(0)
  mockExecuteRaw.mockResolvedValue(1)
  echoTranslate()
})

describe('getMeetingTranslation', () => {
  it('translates summary, action items and commitments and keys results by the ORIGINAL row ids', async () => {
    mockMeetingFindFirst.mockResolvedValue(meetingRow())
    const res = await getMeetingTranslation('m1', 't1', 'en')

    expect(res.cached).toBe(false)
    expect(res.sourceLanguage).toBe('ur')
    expect(res.actionItems).toEqual({ a1: 'EN(میں رپورٹ بھیجوں گا)' })
    expect(res.commitments).toEqual({ c1: 'EN(احمد ٹیسٹنگ مکمل کرے گا)' })
    expect((res.summary as any).overview).toBe(`EN(${URDU_SUMMARY.overview})`)
    expect((res.summary as any).topics_discussed[0].bullets).toEqual(['EN(اسٹیجنگ تیار ہے)', 'EN(QA باقی ہے)'])
    expect((res.summary as any).decisions).toEqual(['EN(جمعرات کو ریلیز)'])
    // Structure is preserved: same keys, same array lengths.
    expect(Object.keys(res.summary as any).sort()).toEqual(Object.keys(URDU_SUMMARY).sort())
  })

  it('sends only structured content to the pipeline (no transcript) and never writes to original data', async () => {
    mockMeetingFindFirst.mockResolvedValue(meetingRow())
    await getMeetingTranslation('m1', 't1', 'en')

    const req = mockTranslate.mock.calls[0][0]
    expect(Object.keys(req).sort()).toEqual(['items', 'meeting_id', 'source_language', 'target_language', 'team_id'])
    expect(req.items.map((i: any) => i.key)).toEqual(
      expect.arrayContaining(['summary.overview', 'action.a1', 'commitment.c1', 'summary.topics_discussed.0.bullets.1'])
    )
    // The only write is the JSONB cache column — never the summary / rows.
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1)
    const sql = (mockExecuteRaw.mock.calls[0][0] as TemplateStringsArray).join('?')
    expect(sql).toContain('"translations"')
    expect(sql).not.toMatch(/"summary"\s*=/)
  })

  it('serves a fresh cache entry without calling the AI pipeline', async () => {
    mockMeetingFindFirst.mockResolvedValue(meetingRow())
    await getMeetingTranslation('m1', 't1', 'en')
    const cachedEntry = JSON.parse(String((mockExecuteRaw.mock.calls[0] as any[])[2]))

    mockTranslate.mockClear()
    mockMeetingFindFirst.mockResolvedValue(meetingRow({ translations: { en: cachedEntry } }))
    const res = await getMeetingTranslation('m1', 't1', 'en')

    expect(res.cached).toBe(true)
    expect(mockTranslate).not.toHaveBeenCalled()
    expect(res.actionItems.a1).toBe('EN(میں رپورٹ بھیجوں گا)')
  })

  it('invalidates the cache when the source summary changes', async () => {
    mockMeetingFindFirst.mockResolvedValue(meetingRow())
    await getMeetingTranslation('m1', 't1', 'en')
    const cachedEntry = JSON.parse(String((mockExecuteRaw.mock.calls[0] as any[])[2]))

    mockTranslate.mockClear()
    const edited = { ...URDU_SUMMARY, overview: 'نیا خلاصہ جو بدل گیا ہے اور مختلف ہے' }
    mockMeetingFindFirst.mockResolvedValue(
      meetingRow({ summary: JSON.stringify(edited), translations: { en: cachedEntry } })
    )
    const res = await getMeetingTranslation('m1', 't1', 'en')

    expect(mockTranslate).toHaveBeenCalledTimes(1)
    expect(res.cached).toBe(false)
    expect((res.summary as any).overview).toBe(`EN(${edited.overview})`)
  })

  it('invalidates the cache when an action item text changes', async () => {
    mockMeetingFindFirst.mockResolvedValue(meetingRow())
    await getMeetingTranslation('m1', 't1', 'en')
    const cachedEntry = JSON.parse(String((mockExecuteRaw.mock.calls[0] as any[])[2]))

    mockTranslate.mockClear()
    mockMeetingFindFirst.mockResolvedValue(
      meetingRow({ actionItems: [{ id: 'a1', text: 'میں کل رپورٹ بھیجوں گا' }], translations: { en: cachedEntry } })
    )
    await getMeetingTranslation('m1', 't1', 'en')
    expect(mockTranslate).toHaveBeenCalledTimes(1)
  })

  it('de-duplicates concurrent requests in-process: one pipeline call, both callers get the result', async () => {
    mockMeetingFindFirst.mockResolvedValue(meetingRow())
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const impl = mockTranslate.getMockImplementation()!
    mockTranslate.mockImplementation(async (req: any) => {
      await gate
      return impl(req)
    })

    const p1 = getMeetingTranslation('m1', 't1', 'en')
    const p2 = getMeetingTranslation('m1', 't1', 'en')
    const p3 = getMeetingTranslation('m1', 't1', 'en')
    await new Promise((r) => setImmediate(r))
    release()
    const [r1, r2, r3] = await Promise.all([p1, p2, p3])

    expect(mockTranslate).toHaveBeenCalledTimes(1)
    expect(r1.actionItems).toEqual(r2.actionItems)
    expect(r3.actionItems).toEqual(r1.actionItems)
    expect([r1.cached, r2.cached, r3.cached].filter((c) => c === false)).toHaveLength(1)
  })

  it('across instances: a peer holding the Redis lock makes us wait and reuse its cached result', async () => {
    mockMeetingFindFirst.mockResolvedValue(meetingRow())
    // First get a real cache entry to hand back as "the peer finished".
    await getMeetingTranslation('m1', 't1', 'en')
    const cachedEntry = JSON.parse(String((mockExecuteRaw.mock.calls[0] as any[])[2]))

    mockTranslate.mockClear()
    mockRedisSet.mockResolvedValueOnce(null) // lock held by someone else
    mockMeetingFindUnique.mockResolvedValue({ translations: { en: cachedEntry } })
    jest.useFakeTimers()
    const p = getMeetingTranslation('m1', 't1', 'en')
    await jest.advanceTimersByTimeAsync(1_100)
    const res = await p
    jest.useRealTimers()

    expect(res.cached).toBe(true)
    expect(mockTranslate).not.toHaveBeenCalled()
  })

  it('does not cache a partial result, and falls back to original text for dropped keys (never blank)', async () => {
    mockMeetingFindFirst.mockResolvedValue(meetingRow())
    echoTranslate((k) => k === 'summary.overview')
    const res = await getMeetingTranslation('m1', 't1', 'en')

    expect(mockExecuteRaw).not.toHaveBeenCalled()
    expect((res.summary as any).overview).toBe(URDU_SUMMARY.overview) // original, not empty
    expect((res.summary as any).meeting_purpose).toBe(`EN(${URDU_SUMMARY.meeting_purpose})`)
  })

  it('maps a pipeline failure to TRANSLATION_FAILED (502), releases the lock and caches nothing', async () => {
    mockMeetingFindFirst.mockResolvedValue(meetingRow())
    mockTranslate.mockRejectedValue(new Error('upstream down'))

    await expect(getMeetingTranslation('m1', 't1', 'en')).rejects.toMatchObject({
      code: 'TRANSLATION_FAILED',
      statusCode: 502,
    })
    expect(mockRedisDel).toHaveBeenCalled()
    expect(mockExecuteRaw).not.toHaveBeenCalled()

    // A retry after the failure works (no poisoned in-flight entry).
    echoTranslate()
    await expect(getMeetingTranslation('m1', 't1', 'en')).resolves.toMatchObject({ cached: false })
  })

  it('is tenant-scoped: a meeting from another team is a 404', async () => {
    mockMeetingFindFirst.mockResolvedValue(null)
    await expect(getMeetingTranslation('m1', 'other-team', 'en')).rejects.toMatchObject({ statusCode: 404 })
    expect(mockMeetingFindFirst.mock.calls[0][0].where).toEqual({ id: 'm1', teamId: 'other-team' })
    expect(mockTranslate).not.toHaveBeenCalled()
  })

  it('rejects meetings that are already English (no pointless OpenAI call)', async () => {
    mockMeetingFindFirst.mockResolvedValue(meetingRow({ language: 'en' }))
    await expect(getMeetingTranslation('m1', 't1', 'en')).rejects.toMatchObject({
      code: 'ALREADY_IN_TARGET_LANGUAGE',
    })
    expect(mockTranslate).not.toHaveBeenCalled()
  })

  it('handles pre-feature meetings (language NULL, legacy plain-text summary) by inferring the language', async () => {
    mockMeetingFindFirst.mockResolvedValue(
      meetingRow({ language: null, summary: 'ٹیم نے ڈیپلائمنٹ کا جائزہ لیا اور تاریخ طے کی اور رپورٹ بھیجی', actionItems: [], commitments: [] })
    )
    const res = await getMeetingTranslation('m1', 't1', 'en')
    expect(res.sourceLanguage).toBe('ur')
    expect((res.summary as any).overview).toMatch(/^EN\(/)
  })

  it('reports empty/incomplete meetings clearly instead of calling the AI', async () => {
    mockMeetingFindFirst.mockResolvedValue(meetingRow({ summary: null, actionItems: [], commitments: [] }))
    await expect(getMeetingTranslation('m1', 't1', 'en')).rejects.toMatchObject({ code: 'NOTHING_TO_TRANSLATE' })

    mockMeetingFindFirst.mockResolvedValue(
      meetingRow({ summary: JSON.stringify({ overview: '', key_takeaways: [] }), actionItems: [], commitments: [] })
    )
    await expect(getMeetingTranslation('m1', 't1', 'en')).rejects.toMatchObject({ code: 'NOTHING_TO_TRANSLATE' })
  })

  it('works with an incomplete summary (only some sections) plus items', async () => {
    mockMeetingFindFirst.mockResolvedValue(meetingRow({ summary: JSON.stringify({ overview: URDU_SUMMARY.overview }) }))
    const res = await getMeetingTranslation('m1', 't1', 'en')
    expect(Object.keys(res.summary as any)).toEqual(['overview'])
    expect(res.actionItems.a1).toBeDefined()
  })
})

describe('detectLanguageFromText', () => {
  it.each([
    ['The team agreed to ship the release on Thursday after QA', 'en'],
    ['ٹیم نے ڈیپلائمنٹ کا جائزہ لیا اور تاریخ طے کی', 'ur'],
    ['टीम ने डिप्लॉयमेंट की समीक्षा की और तारीख तय की', 'hi'],
    ['ٹیم نے sprint planning کے بعد API deployment طے کی', 'ur'],
    ['ok', 'en'],
    ['', 'en'],
  ])('%s → %s', (text, code) => {
    expect(detectLanguageFromText(text)).toBe(code)
  })
})
