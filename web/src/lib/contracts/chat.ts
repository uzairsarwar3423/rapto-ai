/**
 * contracts/chat.ts
 * ─────────────────
 * Single source of truth, on the web side, for the Day 58 chat contract (SSE protocol v1, REST bodies, BFF error
 * envelope). Hand-written (the backend is Python/Pydantic; there is no codegen path today) and **continuously verified
 * against the backend's golden transcripts** by tests/contract/*.test.ts, so protocol drift fails CI.
 *
 * Forward-compatibility rules (protocol doc §3):
 *  - unknown EVENTS are ignored            → `decodeFrame` returns null
 *  - unknown FIELDS are ignored            → zod objects strip unknown keys
 *  - unknown enum VALUES degrade softly    → stage / finish_reason / error code / source type are normalised, not rejected
 *  - an unknown protocol VERSION           → ProtocolVersionError ("update required" UI), never a silent misparse
 *
 * Isomorphic: imported by the BFF (server) and by the browser client. No server-only code here.
 */

import { z } from "zod";

// ─── Limits (client-side mirror; the SERVER stays authoritative and its 422 is surfaced) ─────────────────────────
export const CHAT_LIMITS = {
  /** Pydantic `max_length` on the raw message, counted in Unicode code points. */
  messageMaxChars: 2_000,
  /** Show the character counter once usage passes this fraction of the limit. */
  counterThreshold: 0.8,
  maxFilterIds: 50,
  /** `MAX_DATE_SPAN_DAYS = 3 * 366` */
  maxDateSpanDays: 3 * 366,
  titleMaxChars: 120,
  feedbackCommentMaxChars: 1_000,
  /** The AI service allows at most two concurrent streams per user. */
  maxConcurrentStreams: 2,
  /** No bytes (heartbeats count; the server pings every 15 s) for this long ⇒ the connection is dead. */
  watchdogMs: 35_000,
  /** Largest single SSE event we will buffer before declaring a protocol error. */
  maxEventBytes: 512 * 1024,
} as const;

export const SSE_PROTOCOL_VERSION = 1;

/** Ids as the backend validates them (`IdStr`): cuid / uuid / slug-like, 1–64 chars. */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Sources ───────────────────────────────────────────────────────────────────────────────────────────────────────
export const KNOWN_SOURCE_TYPES = [
  "transcript_chunk",
  "commitment",
  "action_item",
  "decision",
  "summary",
  "digest",
  "analytics",
] as const;
export type KnownSourceType = (typeof KNOWN_SOURCE_TYPES)[number];

export const sourceItemSchema = z.object({
  source_id: z.string().regex(/^S[1-9][0-9]{0,2}$/),
  /** Lenient: an unknown future type renders as a generic source instead of failing the whole stream. */
  type: z.string(),
  meeting_id: z.string().nullish(),
  meeting_title: z.string().nullish(),
  commitment_id: z.string().nullish(),
  speaker: z.string().nullish(),
  start_ms: z.number().int().nullish(),
  end_ms: z.number().int().nullish(),
  occurred_at: z.string().nullish(),
  /** Plain text. Always rendered as text, never as markup. */
  preview: z.string().default(""),
  // analytics-only
  tool: z.string().nullish(),
  params: z.record(z.string(), z.unknown()).nullish(),
  as_of: z.string().nullish(),
  /** History reads blank the preview of meetings the caller can no longer see. */
  redacted: z.boolean().default(false),
});
export type SourceItem = z.infer<typeof sourceItemSchema>;

// ─── SSE events ────────────────────────────────────────────────────────────────────────────────────────────────────
const v = z.number().int();

export const metaEventSchema = z.object({
  v,
  request_id: z.string(),
  session_id: z.string(),
  message_id: z.string(),
  replayed: z.boolean().default(false),
});
export const statusEventSchema = z.object({
  v,
  stage: z.string(),
  detail: z.record(z.string(), z.unknown()).nullish(),
});
export const sourcesEventSchema = z.object({ v, sources: z.array(sourceItemSchema) });
export const tokenEventSchema = z.object({ v, t: z.string() });
export const citationsEventSchema = z.object({
  v,
  valid: z.array(z.string()).default([]),
  removed: z.array(z.string()).default([]),
  grounded: z.boolean().default(true),
  flags: z.array(z.string()).default([]),
});

/** Quota object from the Day 58 §3.3 amendment. Optional today: the client works without it. */
export const quotaSchema = z.object({
  scope: z.string().optional(),
  limit: z.number().int().nullish(),
  remaining: z.number().int().nullish(),
  resets_at: z.string().nullish(),
});
export type Quota = z.infer<typeof quotaSchema>;

export const usageEventSchema = z.object({
  v,
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  quota_remaining: z.number().int().nullish(),
  quota: quotaSchema.nullish(),
});
export const doneEventSchema = z.object({ v, finish_reason: z.string() });
export const errorEventSchema = z.object({
  v,
  code: z.string(),
  message: z.string().default(""),
  retryable: z.boolean().default(false),
});

export const KNOWN_STAGES = ["rewriting", "searching", "reading", "answering"] as const;
export type Stage = (typeof KNOWN_STAGES)[number];

export const FINISH_REASONS = ["stop", "no_results", "cancelled", "length", "filtered"] as const;
export type FinishReason = (typeof FINISH_REASONS)[number];

export const STREAM_ERROR_CODES = ["MODEL_UNAVAILABLE", "TIMEOUT", "CONTENT_FILTERED", "INTERNAL"] as const;
export type StreamErrorCode = (typeof STREAM_ERROR_CODES)[number];

/** Normalised, typed event the rest of the app consumes. */
export type ChatEvent =
  | ({ type: "meta" } & z.infer<typeof metaEventSchema>)
  | ({ type: "status" } & Omit<z.infer<typeof statusEventSchema>, "stage"> & { stage: Stage | "unknown" })
  | ({ type: "sources" } & z.infer<typeof sourcesEventSchema>)
  | ({ type: "token" } & z.infer<typeof tokenEventSchema>)
  | ({ type: "citations" } & z.infer<typeof citationsEventSchema>)
  | ({ type: "usage" } & z.infer<typeof usageEventSchema>)
  | ({ type: "done" } & Omit<z.infer<typeof doneEventSchema>, "finish_reason"> & { finish_reason: FinishReason })
  | ({ type: "error" } & Omit<z.infer<typeof errorEventSchema>, "code"> & { code: StreamErrorCode });

export const TERMINAL_EVENT_TYPES: ReadonlySet<ChatEvent["type"]> = new Set(["done", "error"]);

export class ProtocolError extends Error {
  readonly kind = "protocol" as const;
  constructor(
    message: string,
    readonly reason: "bad_json" | "bad_schema" | "event_too_large" | "missing_data",
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ProtocolError";
  }
}

export class ProtocolVersionError extends Error {
  readonly kind = "version" as const;
  constructor(readonly received: number) {
    super(`Unsupported chat protocol version ${received}`);
    this.name = "ProtocolVersionError";
  }
}

export function normalizeFinishReason(raw: string): FinishReason {
  return (FINISH_REASONS as readonly string[]).includes(raw) ? (raw as FinishReason) : "stop";
}
export function normalizeErrorCode(raw: string): StreamErrorCode {
  return (STREAM_ERROR_CODES as readonly string[]).includes(raw) ? (raw as StreamErrorCode) : "INTERNAL";
}
export function normalizeStage(raw: string): Stage | "unknown" {
  return (KNOWN_STAGES as readonly string[]).includes(raw) ? (raw as Stage) : "unknown";
}

const EVENT_SCHEMAS = {
  meta: metaEventSchema,
  status: statusEventSchema,
  sources: sourcesEventSchema,
  token: tokenEventSchema,
  citations: citationsEventSchema,
  usage: usageEventSchema,
  done: doneEventSchema,
  error: errorEventSchema,
} as const;

export const EVENT_NAMES: ReadonlySet<string> = new Set(Object.keys(EVENT_SCHEMAS));

/**
 * Validate one SSE frame. Returns `null` for an unknown event name (forward compatible).
 * Throws ProtocolError (bad JSON / bad shape) or ProtocolVersionError.
 */
export function decodeEvent(name: string, data: string): ChatEvent | null {
  if (!EVENT_NAMES.has(name)) return null;
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch (cause) {
    throw new ProtocolError(`Invalid JSON in "${name}" event`, "bad_json", { cause });
  }
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    throw new ProtocolError(`"${name}" event data is not an object`, "bad_schema");
  }
  const version = (json as { v?: unknown }).v;
  if (typeof version === "number" && version !== SSE_PROTOCOL_VERSION) throw new ProtocolVersionError(version);

  const schema = EVENT_SCHEMAS[name as keyof typeof EVENT_SCHEMAS];
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ProtocolError(`"${name}" event failed validation: ${parsed.error.issues[0]?.message ?? "invalid"}`, "bad_schema");
  }
  const d = parsed.data as Record<string, unknown>;
  switch (name) {
    case "status":
      return { type: "status", ...(d as z.infer<typeof statusEventSchema>), stage: normalizeStage(String(d.stage)) };
    case "done":
      return { type: "done", ...(d as z.infer<typeof doneEventSchema>), finish_reason: normalizeFinishReason(String(d.finish_reason)) };
    case "error":
      return { type: "error", ...(d as z.infer<typeof errorEventSchema>), code: normalizeErrorCode(String(d.code)) };
    default:
      return { type: name, ...d } as ChatEvent;
  }
}

// ─── REST bodies ───────────────────────────────────────────────────────────────────────────────────────────────────
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Invalid date");
const idList = z.array(z.string().regex(ID_PATTERN)).max(CHAT_LIMITS.maxFilterIds);

export const chatFiltersSchema = z
  .object({
    meeting_ids: idList.default([]),
    speaker_ids: idList.default([]),
    date_from: isoDate.nullish(),
    date_to: isoDate.nullish(),
  })
  .superRefine((f, ctx) => {
    if (f.date_from && f.date_to) {
      if (f.date_from > f.date_to) ctx.addIssue({ code: "custom", path: ["date_from"], message: "date_from must be on or before date_to" });
      const span = (Date.parse(`${f.date_to}T00:00:00Z`) - Date.parse(`${f.date_from}T00:00:00Z`)) / 86_400_000;
      if (span > CHAT_LIMITS.maxDateSpanDays) ctx.addIssue({ code: "custom", path: ["date_to"], message: "Date range is too large" });
    }
  });
export type ChatFilters = z.infer<typeof chatFiltersSchema>;

/** What the browser sends to the BFF. `team_id` (or anything else unknown) is stripped, never forwarded. */
export const chatRequestSchema = z.object({
  session_id: z.string().regex(UUID_PATTERN).nullish(),
  message: z
    .string()
    .refine((s) => s.trim().length > 0, "Message is empty")
    .refine((s) => Array.from(s).length <= CHAT_LIMITS.messageMaxChars, `Message is too long (max ${CHAT_LIMITS.messageMaxChars} characters)`),
  client_message_id: z.string().regex(UUID_PATTERN),
  filters: chatFiltersSchema.default({ meeting_ids: [], speaker_ids: [] }),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const feedbackRequestSchema = z.object({
  rating: z.enum(["up", "down"]),
  reason: z.enum(["inaccurate", "irrelevant", "incomplete", "unsafe", "other"]).nullish(),
  comment: z.string().max(CHAT_LIMITS.feedbackCommentMaxChars).nullish(),
});
export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>;
export type FeedbackReason = NonNullable<FeedbackRequest["reason"]>;

export const renameRequestSchema = z.object({
  title: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "Title is required").max(CHAT_LIMITS.titleMaxChars)),
});

// ─── REST responses ────────────────────────────────────────────────────────────────────────────────────────────────
export const sessionSchema = z.object({
  id: z.string(),
  title: z.string().default(""),
  message_count: z.number().int().default(0),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ChatSession = z.infer<typeof sessionSchema>;

export const sessionListSchema = z.object({ items: z.array(sessionSchema), next_cursor: z.string().nullish() });
export type SessionList = z.infer<typeof sessionListSchema>;

export const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string().default(""),
  status: z.string().default(""),
  finish_reason: z.string().nullish(),
  intent: z.string().nullish(),
  sources: z.array(sourceItemSchema).default([]),
  created_at: z.string(),
  reply_to: z.string().nullish(),
  feedback: z.string().nullish(),
});
export type ChatMessageRecord = z.infer<typeof messageSchema>;

/** Items are chronological within a page; `next_cursor` pages toward OLDER messages. */
export const messageListSchema = z.object({ items: z.array(messageSchema), next_cursor: z.string().nullish() });
export type MessageList = z.infer<typeof messageListSchema>;

export const suggestionListSchema = z.object({ items: z.array(z.string()) });
export type SuggestionList = z.infer<typeof suggestionListSchema>;

// ─── BFF error envelope (the ONLY error shape the browser ever sees from /api/ai/chat/*) ───────────────────────────
export const CHAT_ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "DUPLICATE_IN_FLIGHT",
  "SESSION_BUSY",
  "INVALID_INPUT",
  "RATE_LIMITED",
  "TOO_MANY_STREAMS",
  "QUOTA_EXCEEDED",
  "MODEL_UNAVAILABLE",
  "FEATURE_DISABLED",
  "QUOTA_UNAVAILABLE",
  "SERVICE_UNAVAILABLE",
  "BAD_ORIGIN",
  "UNSUPPORTED_MEDIA_TYPE",
  "INTERNAL",
] as const;
export type ChatErrorCode = (typeof CHAT_ERROR_CODES)[number];

export const chatErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string().default(""),
    retryable: z.boolean().default(false),
    retry_after_s: z.number().nullish(),
    /** Present on 409 DUPLICATE_IN_FLIGHT and on every BFF-generated response, for support correlation. */
    request_id: z.string().nullish(),
    /** Present on 422: which field failed and why. */
    field: z.string().nullish(),
    reason: z.string().nullish(),
    /** Quota-exceeded extras (amendment; optional). */
    resets_at: z.string().nullish(),
  }),
});
export type ChatErrorBody = z.infer<typeof chatErrorBodySchema>;
export type ChatErrorInfo = ChatErrorBody["error"] & { status: number };

export function normalizeErrorBodyCode(raw: string): ChatErrorCode {
  return (CHAT_ERROR_CODES as readonly string[]).includes(raw) ? (raw as ChatErrorCode) : "INTERNAL";
}
