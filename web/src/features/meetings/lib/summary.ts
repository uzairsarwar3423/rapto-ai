import type { StructuredSummary } from "../types";

/**
 * Pure helpers for the AI-generated meeting summary. Shared by the on-screen Overview
 * and the PDF export so both always read the data the same way.
 */

/** Models often prefix list items with a bullet character; the UI draws its own markers. */
export function stripLeadingBulletChar(text: string): string {
  return text.replace(/^[-*•]\s*/, "").trim();
}

/**
 * Parse an incoming summary which may be:
 *   - a StructuredSummary object  (new v4.0)
 *   - a plain string              (legacy v3 plain text)
 *   - null / undefined            (not yet generated)
 */
export function parseStructuredSummary(
  raw: StructuredSummary | string | null | undefined
): StructuredSummary | null {
  if (!raw) return null;

  if (typeof raw === "string") {
    // Attempt to parse JSON embedded in a string (edge-case: API stringified it)
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) return parsed as StructuredSummary;
    } catch {
      // Not JSON – treat as plain-text overview for backward compat
      return { overview: raw };
    }
  }

  return raw as StructuredSummary;
}

export function hasSummaryContent(summary: StructuredSummary): boolean {
  return !!(
    summary.meeting_purpose ||
    summary.overview ||
    (summary.key_takeaways?.length ?? 0) > 0 ||
    (summary.topics_discussed?.length ?? 0) > 0 ||
    (summary.conclusions?.length ?? 0) > 0 ||
    (summary.decisions?.length ?? 0) > 0
  );
}

/**
 * Deadlines, dates and priorities worth noticing at a glance. Kept deliberately narrow so only a
 * handful of phrases per summary are emphasised — emphasis only works when it is rare.
 */
const KEY_PHRASES = new RegExp(
  "(" +
    [
      // "by Friday", "before next week", "due end of day", "on Monday"
      String.raw`\b(?:by|before|until|due(?:\s+on)?|on)\s+(?:end\s+of\s+(?:the\s+)?(?:day|week|month|quarter|sprint)|EOD|EOW|EOM|tomorrow|today|tonight|next\s+(?:week|month|quarter|sprint)|(?:mon|tues|wednes|thurs|fri|satur|sun)day)\b`,
      // "Nov 20", "November 3rd"
      String.raw`\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?\b`,
      // "11/20", "20-11-2026"
      String.raw`\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b`,
      // "Q4"
      String.raw`\bQ[1-4]\b`,
      // priorities
      String.raw`\b(?:top|high|critical)[-\s]priority\b`,
      String.raw`\bP[0-2]\b`,
      String.raw`\burgent(?:ly)?\b`,
      String.raw`\bblockers?\b`,
      String.raw`\bdeadlines?\b`,
    ].join("|") +
    ")",
  "gi"
);

export interface TextSegment {
  text: string;
  /** true for a deadline / date / priority phrase worth emphasising */
  strong: boolean;
}

/**
 * Split text into plain and emphasised segments. Concatenating the segments always
 * reproduces the original text exactly.
 */
export function splitKeyPhrases(text: string): TextSegment[] {
  // With a single capturing group, split() puts the matches at the odd indexes.
  return text
    .split(KEY_PHRASES)
    .map((part, i) => ({ text: part, strong: i % 2 === 1 }))
    .filter((segment) => segment.text.length > 0);
}
