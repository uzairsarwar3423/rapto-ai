/**
 * chatTelemetry.ts — the ONLY place chat analytics events are defined.
 *
 * PII rule (enforced by tests/unit/chatTelemetry.test.ts): payloads contain ids, lengths, enums and timings only —
 * NEVER message text, source text, titles, names, filter values or search queries. Every event goes through a typed
 * function whose parameter types cannot accept free text, and `scrub` drops any string value that is not a short enum-like
 * token as a second line of defence.
 */
import { trackEvent } from "@/lib/analytics";

type Primitive = string | number | boolean | null | undefined;
type Payload = Record<string, Primitive>;

const SAFE_STRING = /^[A-Za-z0-9_.:-]{1,48}$/;

/** Second line of defence: free-form strings are dropped, so a future careless call cannot leak text. */
export function scrub(payload: Payload): Payload {
  const out: Payload = {};
  for (const [k, v] of Object.entries(payload)) {
    if (typeof v === "string" && !SAFE_STRING.test(v)) continue;
    out[k] = v;
  }
  return out;
}

type Sink = (event: string, payload: Payload) => void;
let sink: Sink = (event, payload) => trackEvent(event, payload);
export function __setTelemetrySink(next: Sink | null): void {
  sink = next ?? ((event, payload) => trackEvent(event, payload));
}
const emit = (event: string, payload: Payload = {}): void => {
  try {
    sink(event, scrub(payload));
  } catch {
    /* telemetry must never break chat */
  }
};

export type LengthBucket = "xs" | "s" | "m" | "l" | "xl";
export function lengthBucket(chars: number): LengthBucket {
  return chars <= 40 ? "xs" : chars <= 120 ? "s" : chars <= 400 ? "m" : chars <= 1200 ? "l" : "xl";
}

export const chatTelemetry = {
  opened: () => emit("chat_opened"),
  messageSent: (p: { textChars: number; newSession: boolean; filtersUsed: boolean; retry: boolean }) =>
    emit("chat_message_sent", { length_bucket: lengthBucket(p.textChars), new_session: p.newSession, filters_used: p.filtersUsed, retry: p.retry }),
  firstEvent: (ms: number) => emit("chat_first_event_ms", { ms: Math.round(ms) }),
  firstToken: (ms: number) => emit("chat_first_token_ms", { ms: Math.round(ms) }),
  completed: (p: { finishReason: string; sources: number; replayed: boolean; tokensPerSecond: number | null }) =>
    emit("chat_completed", { finish_reason: p.finishReason, sources: p.sources, replayed: p.replayed, tokens_per_s: p.tokensPerSecond === null ? null : Math.round(p.tokensPerSecond) }),
  stopped: (p: { byUser: boolean }) => emit("chat_stopped", { by_user: p.byUser }),
  error: (p: { code: string; retryable: boolean; phase: "pre_stream" | "in_stream"; kind: string }) =>
    emit("chat_error", { code: p.code, retryable: p.retryable, phase: p.phase, kind: p.kind }),
  noResults: () => emit("chat_no_results"),
  citationClicked: (p: { sourceType: string; position: number }) => emit("chat_citation_clicked", { source_type: p.sourceType, position: p.position }),
  sourcesOpened: (p: { count: number }) => emit("chat_sources_opened", { count: p.count }),
  suggestionClicked: (p: { index: number }) => emit("chat_suggestion_clicked", { index: p.index }),
  feedbackSubmitted: (p: { rating: "up" | "down"; reason?: string | null }) => emit("chat_feedback_submitted", { rating: p.rating, reason: p.reason ?? null }),
  quotaBannerShown: (p: { remaining: number }) => emit("chat_quota_banner_shown", { remaining: p.remaining }),
  quotaExhausted: () => emit("chat_quota_exhausted"),
  unsupportedNoteShown: () => emit("chat_unsupported_note_shown"),
  copyClicked: (p: { variant: "plain" | "markdown" }) => emit("chat_copy_clicked", { variant: p.variant }),
  connectionLost: () => emit("chat_connection_lost"),
  watchdogFired: () => emit("chat_watchdog_fired"),
  sessionRenamed: () => emit("session_renamed"),
  exportCompleted: (p: { format: "markdown" | "print"; messages: number }) => emit("export_completed", { format: p.format, messages: p.messages }),
  shortcutUsed: (p: { id: string }) => emit("shortcut_used", { shortcut_id: p.id }),
  slashUsed: (p: { id: string }) => emit("composer_slash_used", { command_id: p.id }),
  scopeApplied: (p: { dates: boolean; meetings: boolean; people: boolean }) => emit("composer_scope_applied", { dates: p.dates, meetings: p.meetings, people: p.people }),
  timelineExpanded: () => emit("activity_timeline_expanded"),
  offlineBannerShown: () => emit("offline_banner_shown"),
};
