/**
 * ai/chatErrors.ts
 * ────────────────
 * The BFF's ONE error envelope for /api/ai/chat/*:
 *
 *   { "error": { code, message, retryable, retry_after_s?, request_id, field?, reason?, resets_at? } }
 *
 * Upstream error bodies are NEVER passed through. They are normalised through a whitelist (known code, bounded
 * message, bounded numbers); anything else — an LB's HTML error page, a stack trace, a network failure — becomes a
 * generic 503/504. Two deliberate re-mappings:
 *
 *  - upstream 401 ⇒ 503. A 401 from the AI service means OUR service JWT was rejected (key/kid/audience drift), which
 *    is a server misconfiguration, not a signed-out user. Passing it on as 401 would log the user out of the app.
 *  - upstream 5xx / 502 / 504 ⇒ 503 with `retryable: true`.
 */

import {
  CHAT_ERROR_CODES, chatErrorBodySchema, normalizeErrorBodyCode, type ChatErrorBody, type ChatErrorCode,
} from "@/lib/contracts/chat";

export const DEFAULT_MESSAGES: Record<ChatErrorCode, string> = {
  UNAUTHENTICATED: "Your session has expired. Please sign in again.",
  FORBIDDEN: "Chat isn't available for your account.",
  NOT_FOUND: "Not found.",
  DUPLICATE_IN_FLIGHT: "This message is already being answered.",
  SESSION_BUSY: "Another answer is still being written in this conversation.",
  INVALID_INPUT: "That request wasn't valid.",
  RATE_LIMITED: "Too many requests. Please slow down.",
  TOO_MANY_STREAMS: "Too many answers are running. Finish or stop one first.",
  QUOTA_EXCEEDED: "You've used all of your questions for now.",
  MODEL_UNAVAILABLE: "The assistant is temporarily unavailable.",
  FEATURE_DISABLED: "Chat is temporarily unavailable.",
  QUOTA_UNAVAILABLE: "Usage limits can't be checked right now.",
  SERVICE_UNAVAILABLE: "Chat is temporarily unavailable.",
  BAD_ORIGIN: "This request was blocked.",
  UNSUPPORTED_MEDIA_TYPE: "Unsupported content type.",
  INTERNAL: "Something went wrong.",
};

const DEFAULT_STATUS: Record<ChatErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  DUPLICATE_IN_FLIGHT: 409,
  SESSION_BUSY: 409,
  INVALID_INPUT: 422,
  RATE_LIMITED: 429,
  TOO_MANY_STREAMS: 429,
  QUOTA_EXCEEDED: 429,
  MODEL_UNAVAILABLE: 503,
  FEATURE_DISABLED: 503,
  QUOTA_UNAVAILABLE: 503,
  SERVICE_UNAVAILABLE: 503,
  BAD_ORIGIN: 403,
  UNSUPPORTED_MEDIA_TYPE: 415,
  INTERNAL: 500,
};

const RETRYABLE: ReadonlySet<ChatErrorCode> = new Set([
  "RATE_LIMITED", "TOO_MANY_STREAMS", "MODEL_UNAVAILABLE", "FEATURE_DISABLED", "QUOTA_UNAVAILABLE", "SERVICE_UNAVAILABLE", "SESSION_BUSY", "DUPLICATE_IN_FLIGHT",
]);

export interface ChatHttpErrorInit {
  status?: number;
  message?: string;
  retryable?: boolean;
  retryAfterS?: number | null;
  field?: string | null;
  reason?: string | null;
  requestId?: string | null;
  resetsAt?: string | null;
}

/** Thrown inside route handlers and converted to the envelope by `errorResponse`. */
export class ChatHttpError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  readonly retryAfterS?: number;
  readonly field?: string;
  readonly reason?: string;
  readonly requestId?: string;
  readonly resetsAt?: string;

  constructor(readonly code: ChatErrorCode, init: ChatHttpErrorInit = {}) {
    super(init.message ?? DEFAULT_MESSAGES[code]);
    this.name = "ChatHttpError";
    this.status = init.status ?? DEFAULT_STATUS[code];
    this.retryable = init.retryable ?? RETRYABLE.has(code);
    if (init.retryAfterS != null) this.retryAfterS = init.retryAfterS;
    if (init.field) this.field = init.field;
    if (init.reason) this.reason = init.reason;
    if (init.requestId) this.requestId = init.requestId;
    if (init.resetsAt) this.resetsAt = init.resetsAt;
  }
}

const NO_STORE = "private, no-store, max-age=0";

export function errorBody(err: ChatHttpError, requestId: string): ChatErrorBody {
  return {
    error: {
      code: err.code,
      message: err.message,
      retryable: err.retryable,
      request_id: err.requestId ?? requestId,
      ...(err.retryAfterS != null ? { retry_after_s: err.retryAfterS } : {}),
      ...(err.field ? { field: err.field } : {}),
      ...(err.reason ? { reason: err.reason } : {}),
      ...(err.resetsAt ? { resets_at: err.resetsAt } : {}),
    },
  };
}

export function errorResponse(err: ChatHttpError, requestId: string): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": NO_STORE,
    "X-Request-Id": requestId,
  });
  if (err.retryAfterS != null) headers.set("Retry-After", String(Math.max(0, Math.ceil(err.retryAfterS))));
  return new Response(JSON.stringify(errorBody(err, requestId)), { status: err.status, headers });
}

/** Anything thrown that is not already a ChatHttpError is an internal error: logged, never leaked. */
export function toChatHttpError(e: unknown): ChatHttpError {
  if (e instanceof ChatHttpError) return e;
  console.error("[chat-bff] unexpected error:", e instanceof Error ? `${e.name}: ${e.message}` : "non-error thrown");
  return new ChatHttpError("INTERNAL");
}

const MAX_MESSAGE_LEN = 200;
const clip = (s: unknown, n = MAX_MESSAGE_LEN): string | undefined => (typeof s === "string" && s.trim() ? s.trim().slice(0, n) : undefined);
const num = (n: unknown): number | undefined => (typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 86_400 * 31 ? n : undefined);

function parseRetryAfter(res: Response): number | undefined {
  const h = res.headers.get("retry-after");
  if (!h) return undefined;
  if (/^\d+$/.test(h)) return num(Number(h));
  const t = Date.parse(h);
  return Number.isNaN(t) ? undefined : num(Math.max(0, Math.round((t - Date.now()) / 1000)));
}

/**
 * Turn a non-OK upstream response into a ChatHttpError. Reads the body defensively (bounded, JSON only).
 */
export async function normalizeUpstreamError(res: Response): Promise<ChatHttpError> {
  const status = res.status;
  let body: unknown;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("json")) {
    try {
      const text = await res.text();
      body = text.length <= 64 * 1024 ? JSON.parse(text) : undefined;
    } catch {
      body = undefined;
    }
  } else {
    await res.body?.cancel().catch(() => undefined); // HTML error pages etc.: discard
  }

  const retryAfter = parseRetryAfter(res);

  // The AI service rejected OUR service token: misconfiguration, never a user-facing sign-out.
  if (status === 401) {
    console.error("[chat-bff] AI service rejected the service JWT (check INTERNAL_JWT_* key/kid/audience)");
    return new ChatHttpError("SERVICE_UNAVAILABLE", { retryable: true });
  }

  const parsed = chatErrorBodySchema.safeParse(body);
  if (parsed.success) {
    const b = parsed.data.error;
    const knownCode = (CHAT_ERROR_CODES as readonly string[]).includes(b.code);
    const code = knownCode ? normalizeErrorBodyCode(b.code) : codeForStatus(status);
    const mappedStatus = outwardStatus(status);
    return new ChatHttpError(code, {
      status: mappedStatus,
      // Backend `public_message`s are client-safe by contract; still bounded. Unknown codes get our own copy.
      ...(knownCode && (status === 422 || b.message) ? { message: clip(b.message) } : {}),
      retryable: b.retryable || RETRYABLE.has(code),
      retryAfterS: num(b.retry_after_s) ?? retryAfter ?? null,
      field: clip(b.field, 64) ?? null,
      reason: clip(b.reason, 64) ?? null,
      requestId: clip(b.request_id, 128) ?? null,
      resetsAt: clip(b.resets_at, 64) ?? null,
    });
  }

  // FastAPI's own 422 shape: { detail: [{ loc, msg, type }] }
  if (status === 422 && body && typeof body === "object" && Array.isArray((body as { detail?: unknown }).detail)) {
    const first = (body as { detail: Array<{ loc?: unknown[]; msg?: unknown }> }).detail[0];
    const loc = Array.isArray(first?.loc) ? first.loc.filter((x) => typeof x === "string" && x !== "body").join(".") : "";
    return new ChatHttpError("INVALID_INPUT", { field: loc || null, message: clip(first?.msg) });
  }

  const code = codeForStatus(status);
  return new ChatHttpError(code, { status: outwardStatus(status), retryAfterS: retryAfter ?? null });
}

function codeForStatus(status: number): ChatErrorCode {
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "SESSION_BUSY";
  if (status === 400 || status === 413 || status === 422) return "INVALID_INPUT";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "SERVICE_UNAVAILABLE";
  return "INTERNAL";
}

/** Statuses the browser may see. Everything unexpected collapses to 503 so upstream internals never shape our API. */
function outwardStatus(status: number): number {
  if ([400, 403, 404, 409, 413, 422, 429].includes(status)) return status;
  if (status === 401) return 503;
  return status >= 500 || status === 502 || status === 504 ? 503 : 500;
}
