// ─────────────────────────────────────────────────────────────────────────────
// utils/language.ts — meeting-language registry + legacy script detection
//
// The AI pipeline detects the language of NEW meetings and the API stores it on
// meetings.language. Meetings processed before multilingual support have
// language = NULL; for those we infer the language from the (already generated)
// summary text by script census so the UI can still offer a translation.
// ─────────────────────────────────────────────────────────────────────────────

export const MEETING_LANGUAGES = {
  en: { name: 'English', nativeName: 'English', rtl: false },
  ur: { name: 'Urdu', nativeName: 'اردو', rtl: true },
  hi: { name: 'Hindi', nativeName: 'हिन्दी', rtl: false },
} as const

export type MeetingLanguageCode = keyof typeof MEETING_LANGUAGES

/** Languages a user can translate INTO. Extend here (and nowhere else) to add more. */
export const TRANSLATION_TARGET_LANGUAGES = ['en'] as const
export type TranslationTarget = (typeof TRANSLATION_TARGET_LANGUAGES)[number]

export const DEFAULT_MEETING_LANGUAGE: MeetingLanguageCode = 'en'

const DEVANAGARI = /[ऀ-ॿ]/
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/
const WORD = /[\p{L}\p{M}]+/gu

export function isMeetingLanguage(code: unknown): code is MeetingLanguageCode {
  return typeof code === 'string' && code in MEETING_LANGUAGES
}

/** Script census — mirrors the pipeline's rule (non-Latin words ≥ 35 % wins). */
export function detectLanguageFromText(text: string | null | undefined): MeetingLanguageCode {
  if (!text) return DEFAULT_MEETING_LANGUAGE
  const words = text.match(WORD) ?? []
  if (words.length < 4) return DEFAULT_MEETING_LANGUAGE
  let deva = 0
  let arab = 0
  for (const w of words) {
    if (DEVANAGARI.test(w)) deva++
    else if (ARABIC.test(w)) arab++
  }
  if ((deva + arab) / words.length < 0.35) return DEFAULT_MEETING_LANGUAGE
  return deva >= arab ? 'hi' : 'ur'
}
