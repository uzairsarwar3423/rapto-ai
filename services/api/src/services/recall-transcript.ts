// ─────────────────────────────────────────────────────────────────────────────
// recall-transcript.ts — Recall.ai transcript JSON → normalized utterances
// Format: https://docs.recall.ai/docs/download-schemas
// ─────────────────────────────────────────────────────────────────────────────

export interface NormalizedUtterance {
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
  language: string;
}

/**
 * Recall.ai timestamps are objects — { relative: seconds since recording start,
 * absolute: ISO string | null } (https://docs.recall.ai/docs/download-schemas).
 * Plain numbers are accepted for older/simulated payloads.
 */
function toSeconds(ts: unknown): number | null {
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts
  if (ts && typeof ts === 'object' && typeof (ts as any).relative === 'number') return (ts as any).relative
  return null
}

export function normalizeRecallTranscript(rawTranscript: any[]): NormalizedUtterance[] {
  if (!Array.isArray(rawTranscript)) return []

  const utterances: NormalizedUtterance[] = []
  for (const segment of rawTranscript) {
    if (!segment || typeof segment !== 'object') continue
    const words: any[] = Array.isArray(segment.words) ? segment.words : []

    // 1. Speaker
    let speaker = 'Unknown'
    if (segment.participant?.name) speaker = segment.participant.name
    else if (segment.speaker_name) speaker = segment.speaker_name
    else if (segment.speaker_tag) speaker = segment.speaker_tag
    else if (typeof segment.speaker === 'string') speaker = segment.speaker

    // 2. Text — Recall.ai segments carry words[], not a text field
    const text =
      typeof segment.text === 'string' && segment.text.trim().length > 0
        ? segment.text.trim()
        : words.map((w) => (typeof w?.text === 'string' ? w.text : '')).filter(Boolean).join(' ').trim()
    if (!text) continue // a segment without words carries nothing to analyse

    // 3. Timestamps
    const startTime =
      toSeconds(segment.start_time) ?? toSeconds(segment.start_timestamp) ?? toSeconds(words[0]?.start_timestamp) ?? 0
    const endTime =
      toSeconds(segment.end_time) ?? toSeconds(segment.end_timestamp) ??
      toSeconds(words[words.length - 1]?.end_timestamp) ?? startTime

    // 4. Language
    const language = segment.language_code || segment.language || 'unknown'

    utterances.push({ speaker, text, startTime, endTime, language })
  }
  return utterances
}
