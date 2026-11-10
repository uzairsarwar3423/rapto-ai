import type { TranscriptLanguage } from "../types";

export const TRANSCRIPT_LANGUAGES: ReadonlyArray<{
  code: TranscriptLanguage;
  label: string;
  native: string;
}> = [
  { code: "en", label: "English", native: "English" },
  { code: "ur", label: "Urdu", native: "اردو" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
];

const DEVANAGARI = /[ऀ-ॿ]/g;
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g;
const LETTER = /\p{L}/gu;

/**
 * Dominant script of a body of text → "en" | "ur" | "hi". Mirrors the server's script census
 * (a non-Latin share of ≥ 35 % wins), so the menu never offers the language already on screen.
 */
export function detectScriptLanguage(text: string): TranscriptLanguage {
  const letters = (text.match(LETTER) ?? []).length;
  if (letters === 0) return "en";
  const deva = (text.match(DEVANAGARI) ?? []).length;
  const arab = (text.match(ARABIC) ?? []).length;
  if ((deva + arab) / letters < 0.35) return "en";
  return deva >= arab ? "hi" : "ur";
}

export function languageLabel(code: TranscriptLanguage): string {
  return TRANSCRIPT_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}
