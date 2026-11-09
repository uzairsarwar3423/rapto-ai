// ─────────────────────────────────────────────────────────────────────────────
// meetings.translation.service.ts — on-demand translation of generated meeting content
//
// INVARIANTS
//   • The original summary, action items and commitments are NEVER modified.
//     A translation lives only in meetings.translations[<lang>] (JSONB cache).
//   • Only text is translated; ids/owners/dates/status stay on the original rows
//     and the client re-joins the translated text by id → no duplicate rows.
//   • Cache validity = sourceHash (sha256 of the exact source strings + target).
//     Re-extraction, edited summaries, edited action items … all change the hash
//     and silently invalidate the entry, so a stale translation is never served.
//   • One generation per (meeting, language) at a time: in-process promise
//     sharing + a Redis NX lock across instances; concurrent callers wait for
//     the first result instead of paying for a second OpenAI call.
//   • Only the structured content is sent to the AI pipeline — never the
//     transcript — so cost is proportional to the summary size.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../db/client'
import { redis } from '../../config/redis'
import { logger } from '../../config/logger'
import { AppError, NotFoundError } from '../../utils/errors'
import { aipipelineClient } from '../../services/ai-pipeline/ai-pipeline.client'
import {
  TRANSLATION_TARGET_LANGUAGES,
  detectLanguageFromText,
  isMeetingLanguage,
  type MeetingLanguageCode,
  type TranslationTarget,
} from '../../utils/language'

// ── Types ─────────────────────────────────────────────────────────────────────

type SummaryObject = Record<string, unknown>

export interface MeetingTranslation {
  language: TranslationTarget
  sourceLanguage: string
  /** True when served from the cache without calling the AI pipeline. */
  cached: boolean
  summary: SummaryObject | null
  actionItems: Record<string, string>
  commitments: Record<string, string>
  generatedAt: string
}

interface CachedTranslation {
  sourceHash: string
  sourceLanguage: string
  summary: SummaryObject | null
  actionItems: Record<string, string>
  commitments: Record<string, string>
  createdAt: string
  model: string
}

interface SourceItem {
  key: string
  text: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LOCK_TTL_SECONDS = 120
const WAIT_FOR_PEER_MS = 100_000
const WAIT_POLL_MS = 1_000
const MAX_ITEMS = 400
const MAX_ITEM_CHARS = 8_000

const SUMMARY_PREFIX = 'summary.'
const ACTION_PREFIX = 'action.'
const COMMITMENT_PREFIX = 'commitment.'

// In-process de-dup: concurrent identical requests share one promise.
const inFlight = new Map<string, Promise<MeetingTranslation>>()

// ── Summary flattening (structure-preserving) ─────────────────────────────────

function parseSummary(raw: string | null): SummaryObject | null {
  if (!raw || !raw.trim()) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as SummaryObject
  } catch {
    /* legacy plain-text summary */
  }
  return { overview: raw }
}

/** Every translatable string in a StructuredSummary, addressed by a stable path key. */
function summaryEntries(summary: SummaryObject): SourceItem[] {
  const out: SourceItem[] = []
  const push = (path: string, v: unknown) => {
    if (typeof v === 'string' && v.trim()) out.push({ key: SUMMARY_PREFIX + path, text: v })
  }
  push('meeting_purpose', summary.meeting_purpose)
  push('overview', summary.overview)
  for (const field of ['key_takeaways', 'conclusions', 'decisions'] as const) {
    const arr = summary[field]
    if (Array.isArray(arr)) arr.forEach((v, i) => push(`${field}.${i}`, v))
  }
  const topics = summary.topics_discussed
  if (Array.isArray(topics)) {
    topics.forEach((t, i) => {
      if (!t || typeof t !== 'object') return
      push(`topics_discussed.${i}.topic`, (t as any).topic)
      const bullets = (t as any).bullets
      if (Array.isArray(bullets)) bullets.forEach((b: unknown, j: number) => push(`topics_discussed.${i}.bullets.${j}`, b))
    })
  }
  return out
}

/** Clone of `summary` with translated strings substituted by path; anything missing keeps the original. */
function applySummary(summary: SummaryObject, translated: Map<string, string>): SummaryObject {
  const clone = JSON.parse(JSON.stringify(summary)) as SummaryObject
  const get = (path: string, fallback: unknown) => translated.get(SUMMARY_PREFIX + path) ?? fallback
  if (typeof clone.meeting_purpose === 'string') clone.meeting_purpose = get('meeting_purpose', clone.meeting_purpose)
  if (typeof clone.overview === 'string') clone.overview = get('overview', clone.overview)
  for (const field of ['key_takeaways', 'conclusions', 'decisions'] as const) {
    const arr = clone[field]
    if (Array.isArray(arr)) clone[field] = arr.map((v, i) => (typeof v === 'string' ? get(`${field}.${i}`, v) : v))
  }
  const topics = clone.topics_discussed
  if (Array.isArray(topics)) {
    topics.forEach((t: any, i: number) => {
      if (!t || typeof t !== 'object') return
      if (typeof t.topic === 'string') t.topic = get(`topics_discussed.${i}.topic`, t.topic)
      if (Array.isArray(t.bullets)) {
        t.bullets = t.bullets.map((b: unknown, j: number) =>
          typeof b === 'string' ? get(`topics_discussed.${i}.bullets.${j}`, b) : b
        )
      }
    })
  }
  return clone
}

function hashSource(items: SourceItem[], target: string): string {
  const h = crypto.createHash('sha256')
  h.update(target)
  for (const it of items) {
    h.update('\u0000')
    h.update(it.key)
    h.update('\u0001')
    h.update(it.text)
  }
  return h.digest('hex')
}

// ── Public API ────────────────────────────────────────────────────────────────

export function isSupportedTarget(lang: string): lang is TranslationTarget {
  return (TRANSLATION_TARGET_LANGUAGES as readonly string[]).includes(lang)
}

export async function getMeetingTranslation(
  meetingId: string,
  teamId: string,
  target: TranslationTarget
): Promise<MeetingTranslation> {
  // Tenant-scoped load: a meeting in another team is a 404, never a 403 (no existence leak).
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, teamId },
    select: {
      id: true,
      teamId: true,
      summary: true,
      language: true,
      translations: true,
      actionItems: { select: { id: true, text: true }, orderBy: { id: 'asc' } },
      commitments: { select: { id: true, text: true }, orderBy: { id: 'asc' } },
    },
  })
  if (!meeting) throw new NotFoundError('Meeting', meetingId)

  const summary = parseSummary(meeting.summary)
  const items: SourceItem[] = [
    ...(summary ? summaryEntries(summary) : []),
    ...meeting.actionItems.filter((a) => a.text?.trim()).map((a) => ({ key: ACTION_PREFIX + a.id, text: a.text })),
    ...meeting.commitments.filter((c) => c.text?.trim()).map((c) => ({ key: COMMITMENT_PREFIX + c.id, text: c.text })),
  ]

  if (items.length === 0) {
    throw new AppError('NOTHING_TO_TRANSLATE', 422, 'This meeting has no generated content to translate yet.')
  }
  if (items.length > MAX_ITEMS || items.some((i) => i.text.length > MAX_ITEM_CHARS)) {
    throw new AppError('CONTENT_TOO_LARGE', 422, 'Meeting content is too large to translate in one request.')
  }

  const sourceLanguage: MeetingLanguageCode = isMeetingLanguage(meeting.language)
    ? meeting.language
    : detectLanguageFromText(items.map((i) => i.text).join('\n'))

  if (sourceLanguage === target) {
    throw new AppError('ALREADY_IN_TARGET_LANGUAGE', 422, 'Meeting content is already in the requested language.')
  }

  const sourceHash = hashSource(items, target)
  const hit = readCache(meeting.translations, target, sourceHash)
  if (hit) return toResponse(hit, target, true)

  const flightKey = `${meetingId}:${target}`
  const existing = inFlight.get(flightKey)
  if (existing) return existing.then((r) => ({ ...r, cached: true }))

  const run = generate({ meetingId, teamId, target, sourceLanguage, sourceHash, summary, items })
  inFlight.set(flightKey, run)
  try {
    return await run
  } finally {
    inFlight.delete(flightKey)
  }
}

// ── Internals ─────────────────────────────────────────────────────────────────

function readCache(raw: Prisma.JsonValue | null, target: string, sourceHash: string): CachedTranslation | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const entry = (raw as Record<string, unknown>)[target] as CachedTranslation | undefined
  return entry && entry.sourceHash === sourceHash ? entry : null
}

function toResponse(entry: CachedTranslation, target: TranslationTarget, cached: boolean): MeetingTranslation {
  return {
    language: target,
    sourceLanguage: entry.sourceLanguage,
    cached,
    summary: entry.summary,
    actionItems: entry.actionItems ?? {},
    commitments: entry.commitments ?? {},
    generatedAt: entry.createdAt,
  }
}

async function readFreshCache(meetingId: string, target: string, sourceHash: string) {
  const row = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { translations: true } })
  return readCache(row?.translations ?? null, target, sourceHash)
}

async function generate(args: {
  meetingId: string
  teamId: string
  target: TranslationTarget
  sourceLanguage: string
  sourceHash: string
  summary: SummaryObject | null
  items: SourceItem[]
}): Promise<MeetingTranslation> {
  const { meetingId, teamId, target, sourceLanguage, sourceHash, summary, items } = args
  const lockKey = `translate:lock:${meetingId}:${target}`

  // Cross-instance de-dup: only one generation per (meeting, language).
  const acquired = await redis.set(lockKey, sourceHash, 'EX', LOCK_TTL_SECONDS, 'NX')
  if (!acquired) {
    const deadline = Date.now() + WAIT_FOR_PEER_MS
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, WAIT_POLL_MS))
      const peer = await readFreshCache(meetingId, target, sourceHash)
      if (peer) return toResponse(peer, target, true)
      if (!(await redis.exists(lockKey))) break // peer failed/finished without caching → we take over below
    }
    const lateHit = await readFreshCache(meetingId, target, sourceHash)
    if (lateHit) return toResponse(lateHit, target, true)
    const retaken = await redis.set(lockKey, sourceHash, 'EX', LOCK_TTL_SECONDS, 'NX')
    if (!retaken) {
      throw new AppError('TRANSLATION_IN_PROGRESS', 409, 'A translation for this meeting is already being generated.')
    }
  }

  try {
    const result = await aipipelineClient.translate({
      meeting_id: meetingId,
      team_id: teamId,
      source_language: sourceLanguage,
      target_language: target,
      items,
    })

    const translated = new Map(result.items.map((i) => [i.key, i.text]))
    const actionItems: Record<string, string> = {}
    const commitments: Record<string, string> = {}
    for (const it of items) {
      const text = translated.get(it.key)
      if (text === undefined) continue
      if (it.key.startsWith(ACTION_PREFIX)) actionItems[it.key.slice(ACTION_PREFIX.length)] = text
      else if (it.key.startsWith(COMMITMENT_PREFIX)) commitments[it.key.slice(COMMITMENT_PREFIX.length)] = text
    }

    const entry: CachedTranslation = {
      sourceHash,
      sourceLanguage,
      summary: summary ? applySummary(summary, translated) : null,
      actionItems,
      commitments,
      createdAt: new Date().toISOString(),
      model: result.model,
    }

    // Partial result (model dropped keys twice): serve it, but don't cache — the next
    // request retries instead of pinning a half-translated view. Missing parts fall back
    // to the original text on the client, never blank.
    if (result.missing_keys.length === 0) {
      await prisma.$executeRaw`
        UPDATE "meetings"
        SET "translations" = COALESCE("translations", '{}'::jsonb) || jsonb_build_object(${target}::text, ${JSON.stringify(entry)}::jsonb)
        WHERE "id" = ${meetingId}
      `
    } else {
      logger.warn({ meetingId, target, missing: result.missing_keys.length }, 'translation: partial result not cached')
    }

    logger.info(
      { meetingId, teamId, target, items: items.length, costUsd: result.total_cost?.estimated_cost_usd },
      'translation: generated'
    )
    return toResponse(entry, target, false)
  } catch (err) {
    logger.error({ err, meetingId, target }, 'translation: generation failed')
    if (err instanceof AppError) throw err
    throw new AppError('TRANSLATION_FAILED', 502, 'Translation is temporarily unavailable. Please try again.')
  } finally {
    await redis.del(lockKey).catch(() => {})
  }
}
