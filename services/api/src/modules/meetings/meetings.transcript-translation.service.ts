// ─────────────────────────────────────────────────────────────────────────────
// meetings.transcript-translation.service.ts — on-demand translation of the TRANSCRIPT
// (whole meeting, or one speaker) into English / Urdu / Hindi.
//
// INVARIANTS
//   • The Mongo transcript (raw_transcript / normalized_transcript) is NEVER written.
//     Translations live in meetings.translations["transcript:<lang>"] (existing JSONB
//     column — no new table), next to the summary translation cache.
//   • The cache is SEGMENT-level: { segments: { [segmentId]: { h: sha1(text), t: translated } } }.
//     – Segment ids / order / timestamps / speakers stay on the original transcript; the
//       client re-joins translated text by segment id → nothing is lost or duplicated.
//     – Full-transcript and per-speaker requests share the same cache, so translating one
//       speaker first makes the later full translation cheaper (and vice versa).
//     – `h` is the hash of the exact source text: editing/re-cleaning a segment silently
//       invalidates only that segment (stale translations are never served).
//   • Speaker scope: only that speaker's segments are sent to the model. The meeting title /
//     summary is passed as read-only BACKGROUND context, never as items, so no other
//     speaker's dialogue can appear in the output.
//   • The speaker is validated against the transcript of THIS tenant-scoped meeting; an
//     arbitrary speaker string is a 404.
//   • Segments already written in the target language (by script) are not sent to the model.
//   • One generation per (meeting, language, scope): in-process promise sharing + Redis NX
//     lock. Different speakers run in parallel. Progress is persisted chunk by chunk, so a
//     failure part-way keeps what was done and a retry only pays for the rest.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../db/client'
import { redis } from '../../config/redis'
import { logger } from '../../config/logger'
import { AppError, NotFoundError } from '../../utils/errors'
import { mongoService } from '../../services/mongo.service'
import { aipipelineClient } from '../../services/ai-pipeline/ai-pipeline.client'
import type { TranslationTarget } from '../../utils/language'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TranscriptSegment {
  id: string
  speaker: string
  text: string
}

export interface TranscriptTranslation {
  language: TranslationTarget
  scope: 'full' | 'speaker'
  speaker: string | null
  /** True when nothing had to be generated for this request. */
  cached: boolean
  /** Some segments could not be translated this time (they keep their original text); retry fills them. */
  partial: boolean
  translatedCount: number
  totalCount: number
  /** segmentId → translated text. Segments absent here are shown in their original language. */
  segments: Record<string, string>
  generatedAt: string
}

interface CachedSegment {
  h: string
  t: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CACHE_PREFIX = 'transcript:'
const LOCK_TTL_SECONDS = 180
const WAIT_FOR_PEER_MS = 150_000
const WAIT_POLL_MS = 1_000
const MAX_SEGMENTS = 6_000
const CHUNK_ITEMS = 120
const CHUNK_CHARS = 24_000
const CHUNK_CONCURRENCY = 2
const MAX_PIECE_CHARS = 7_000
const CONTEXT_CHARS = 1_800

const inFlight = new Map<string, Promise<TranscriptTranslation>>()

// ── Transcript extraction (mirrors the web viewer's mapping exactly) ──────────

export function extractSegments(doc: any): TranscriptSegment[] {
  const source: any[] =
    Array.isArray(doc?.normalized_transcript) && doc.normalized_transcript.length > 0
      ? doc.normalized_transcript
      : Array.isArray(doc?.raw_transcript)
        ? doc.raw_transcript
        : []

  return source.map((turn, index) => {
    const speaker: string =
      turn.speaker || turn.speaker_name || turn.participant?.name || turn.speaker_tag || 'Unknown Speaker'
    let text = ''
    if (typeof turn.cleaned_text === 'string') text = turn.cleaned_text
    else if (typeof turn.text === 'string') text = turn.text
    else if (Array.isArray(turn.words)) text = turn.words.map((w: any) => w.text).join(' ').trim()
    return { id: String(turn.id || turn.turn_id || `turn-${index}`), speaker, text }
  })
}

// ── Script census (decides which segments still need translating) ─────────────

const DEVANAGARI = /[ऀ-ॿ]/g
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g
const LETTER = /\p{L}/gu

/** True when the segment is not yet (predominantly) written in the target language. */
export function needsTranslation(text: string, target: TranslationTarget): boolean {
  const letters = (text.match(LETTER) ?? []).length
  if (letters === 0) return false // digits / punctuation only
  const deva = (text.match(DEVANAGARI) ?? []).length
  const arab = (text.match(ARABIC) ?? []).length
  if (target === 'en') return (deva + arab) / letters > 0.15
  const share = (target === 'ur' ? arab : deva) / letters
  return share < 0.6 // mixed turns (e.g. Urdu with many English words) are still translated
}

function sha(text: string): string {
  return crypto.createHash('sha1').update(text).digest('hex').slice(0, 16)
}

// ── Splitting very long turns so one item never exceeds the pipeline's limit ──

interface Piece {
  key: string
  text: string
}

function toPieces(seg: TranscriptSegment): Piece[] {
  if (seg.text.length <= MAX_PIECE_CHARS) return [{ key: seg.id, text: seg.text }]
  const sentences = seg.text.split(/(?<=[.!?۔।؟])\s+/)
  const pieces: Piece[] = []
  let cur = ''
  for (const s of sentences) {
    const parts = s.length > MAX_PIECE_CHARS ? (s.match(new RegExp(`.{1,${MAX_PIECE_CHARS}}`, 'gs')) ?? [s]) : [s]
    for (const p of parts) {
      if (cur && cur.length + p.length + 1 > MAX_PIECE_CHARS) {
        pieces.push({ key: `${seg.id}#${pieces.length}`, text: cur })
        cur = p
      } else {
        cur = cur ? `${cur} ${p}` : p
      }
    }
  }
  if (cur) pieces.push({ key: `${seg.id}#${pieces.length}`, text: cur })
  return pieces
}

function chunkPieces(pieces: Piece[]): Piece[][] {
  const chunks: Piece[][] = []
  let cur: Piece[] = []
  let chars = 0
  for (const p of pieces) {
    if (cur.length && (cur.length >= CHUNK_ITEMS || chars + p.text.length > CHUNK_CHARS)) {
      chunks.push(cur)
      cur = []
      chars = 0
    }
    cur.push(p)
    chars += p.text.length
  }
  if (cur.length) chunks.push(cur)
  return chunks
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

function cacheKey(target: string): string {
  return CACHE_PREFIX + target
}

function readSegments(raw: Prisma.JsonValue | null | undefined, target: string): Record<string, CachedSegment> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const entry = (raw as Record<string, any>)[cacheKey(target)]
  const segs = entry?.segments
  return segs && typeof segs === 'object' && !Array.isArray(segs) ? (segs as Record<string, CachedSegment>) : {}
}

async function readFreshSegments(meetingId: string, target: string) {
  const row = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { translations: true } })
  return readSegments(row?.translations, target)
}

/** Atomic server-side merge: concurrent speaker translations can never overwrite each other. */
async function persistSegments(meetingId: string, target: string, segs: Record<string, CachedSegment>, model: string) {
  if (Object.keys(segs).length === 0) return
  const key = cacheKey(target)
  await prisma.$executeRaw`
    UPDATE "meetings"
    SET "translations" = COALESCE("translations", '{}'::jsonb) || jsonb_build_object(
      ${key}::text,
      COALESCE("translations"->${key}::text, '{}'::jsonb) || jsonb_build_object(
        'model', ${model}::text,
        'updatedAt', ${new Date().toISOString()}::text,
        'segments', COALESCE("translations"->${key}::text->'segments', '{}'::jsonb) || ${JSON.stringify(segs)}::jsonb
      )
    )
    WHERE "id" = ${meetingId}
  `
}

function isFresh(cache: Record<string, CachedSegment>, seg: TranscriptSegment): boolean {
  const hit = cache[seg.id]
  return !!hit && hit.h === sha(seg.text) && typeof hit.t === 'string'
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getTranscriptTranslation(args: {
  meetingId: string
  teamId: string
  target: TranslationTarget
  speaker?: string
}): Promise<TranscriptTranslation> {
  const { meetingId, teamId, target } = args

  // Tenant-scoped: a meeting of another team is a 404 (no existence leak).
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, teamId },
    select: { id: true, title: true, summary: true, language: true, mongoTranscriptId: true, translations: true },
  })
  if (!meeting) throw new NotFoundError('Meeting', meetingId)
  if (!meeting.mongoTranscriptId) {
    throw new AppError('TRANSCRIPT_NOT_AVAILABLE', 404, 'Transcript not yet available for this meeting.')
  }

  const doc = await mongoService.findTranscript(meeting.mongoTranscriptId)
  if (!doc) throw new AppError('MEETING_NO_TRANSCRIPT', 404, 'Transcript document not found.')

  const all = extractSegments(doc)
  if (all.length > MAX_SEGMENTS) {
    throw new AppError('CONTENT_TOO_LARGE', 422, 'Transcript is too large to translate.')
  }

  // The speaker must exist in THIS meeting's transcript — never trust the client value.
  const speaker = args.speaker?.trim() || undefined
  const scoped = speaker ? all.filter((s) => s.speaker === speaker) : all
  if (speaker && scoped.length === 0) throw new NotFoundError('Speaker', speaker)

  const candidates = scoped.filter((s) => s.text.trim() && needsTranslation(s.text, target))
  if (candidates.length === 0) {
    throw new AppError('ALREADY_IN_TARGET_LANGUAGE', 422, 'This content is already in the requested language.')
  }

  const scope: 'full' | 'speaker' = speaker ? 'speaker' : 'full'
  const build = (cache: Record<string, CachedSegment>, cached: boolean, partial: boolean): TranscriptTranslation => {
    const segments: Record<string, string> = {}
    for (const s of candidates) if (isFresh(cache, s)) segments[s.id] = cache[s.id].t
    return {
      language: target,
      scope,
      speaker: speaker ?? null,
      cached,
      partial: partial || Object.keys(segments).length < candidates.length,
      translatedCount: Object.keys(segments).length,
      totalCount: candidates.length,
      segments,
      generatedAt: new Date().toISOString(),
    }
  }

  const cache = readSegments(meeting.translations, target)
  const missing = candidates.filter((s) => !isFresh(cache, s))
  if (missing.length === 0) return build(cache, true, false)

  const flightKey = `${meetingId}:${target}:${speaker ?? '*'}`
  const existing = inFlight.get(flightKey)
  if (existing) return existing.then((r) => ({ ...r, cached: true }))

  const run = generate({
    meetingId,
    teamId,
    target,
    scope,
    speaker,
    candidates,
    missing,
    background: backgroundContext(meeting.title, meeting.summary, speaker),
    sourceLanguage: 'auto', // transcripts are routinely mixed-language: the model detects per turn
  }).then((cacheAfter) => build(cacheAfter, false, false))

  inFlight.set(flightKey, run)
  try {
    return await run
  } finally {
    inFlight.delete(flightKey)
  }
}

// ── Internals ─────────────────────────────────────────────────────────────────

function backgroundContext(title: string | null, summaryRaw: string | null, speaker?: string): string {
  const lines: string[] = []
  if (title) lines.push(`Meeting title: ${title}`)
  if (summaryRaw) {
    let overview = summaryRaw
    try {
      const parsed = JSON.parse(summaryRaw)
      overview = [parsed?.meeting_purpose, parsed?.overview].filter((v) => typeof v === 'string').join(' ')
    } catch {
      /* legacy plain-text summary */
    }
    if (overview.trim()) lines.push(`Meeting summary: ${overview.slice(0, CONTEXT_CHARS)}`)
  }
  if (speaker) lines.push(`Every item below was spoken by: ${speaker}`)
  return lines.join('\n')
}

async function generate(args: {
  meetingId: string
  teamId: string
  target: TranslationTarget
  scope: 'full' | 'speaker'
  speaker?: string
  candidates: TranscriptSegment[]
  missing: TranscriptSegment[]
  background: string
  sourceLanguage: string
}): Promise<Record<string, CachedSegment>> {
  const { meetingId, teamId, target, scope, speaker, candidates, background, sourceLanguage } = args
  const lockKey = `translate:lock:${meetingId}:transcript:${target}:${speaker ?? '*'}`
  let missing = args.missing

  const acquired = await redis.set(lockKey, '1', 'EX', LOCK_TTL_SECONDS, 'NX')
  if (!acquired) {
    // A peer is generating the same scope: wait for its result instead of paying twice.
    const deadline = Date.now() + WAIT_FOR_PEER_MS
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, WAIT_POLL_MS))
      const peer = await readFreshSegments(meetingId, target)
      missing = candidates.filter((s) => !isFresh(peer, s))
      if (missing.length === 0) return peer
      if (!(await redis.exists(lockKey))) break
    }
    const peer = await readFreshSegments(meetingId, target)
    missing = candidates.filter((s) => !isFresh(peer, s))
    if (missing.length === 0) return peer
    const retaken = await redis.set(lockKey, '1', 'EX', LOCK_TTL_SECONDS, 'NX')
    if (!retaken) {
      throw new AppError('TRANSLATION_IN_PROGRESS', 409, 'This translation is already being generated.')
    }
  }

  try {
    const byId = new Map(missing.map((s) => [s.id, s]))
    const pieceOwner = new Map<string, string>() // piece key → segment id
    const pieces: Piece[] = []
    for (const seg of missing) {
      for (const p of toPieces(seg)) {
        pieceOwner.set(p.key, seg.id)
        pieces.push(p)
      }
    }
    const chunks = chunkPieces(pieces)
    const done = new Map<string, string>() // piece key → translated text
    let model = 'n/a'
    let failures = 0
    let firstError: unknown = null

    const runChunk = async (chunk: Piece[]) => {
      try {
        const result = await aipipelineClient.translate({
          meeting_id: meetingId,
          team_id: teamId,
          source_language: sourceLanguage,
          target_language: target,
          content_type: 'transcript',
          context: background || undefined,
          items: chunk.map((p) => ({ key: p.key, text: p.text })),
        })
        model = result.model || model
        const wanted = new Set(chunk.map((p) => p.key))
        for (const it of result.items) if (wanted.has(it.key) && it.text.trim()) done.set(it.key, it.text)

        // Persist every segment whose pieces are ALL translated, right away (resumable progress).
        const segsDone: Record<string, CachedSegment> = {}
        for (const p of chunk) {
          const segId = pieceOwner.get(p.key)!
          const seg = byId.get(segId)!
          if (segsDone[segId]) continue
          const keys = toPieces(seg).map((x) => x.key)
          if (keys.every((k) => done.has(k))) segsDone[segId] = { h: sha(seg.text), t: keys.map((k) => done.get(k)!).join(' ') }
        }
        await persistSegments(meetingId, target, segsDone, model)
      } catch (err) {
        failures++
        firstError ??= err
        logger.warn({ err, meetingId, target }, 'transcript-translation: chunk failed')
      }
    }

    // Bounded concurrency over chunks.
    let next = 0
    await Promise.all(
      Array.from({ length: Math.min(CHUNK_CONCURRENCY, chunks.length) }, async () => {
        while (next < chunks.length) await runChunk(chunks[next++])
      })
    )

    if (failures === chunks.length) {
      logger.error({ err: firstError, meetingId, target }, 'transcript-translation: all chunks failed')
      if (firstError instanceof AppError) throw firstError
      throw new AppError('TRANSLATION_FAILED', 502, 'Translation is temporarily unavailable. Please try again.')
    }

    logger.info(
      { meetingId, teamId, target, scope, segments: missing.length, chunks: chunks.length, failures },
      'transcript-translation: generated'
    )
    return await readFreshSegments(meetingId, target)
  } finally {
    await redis.del(lockKey).catch(() => {})
  }
}
