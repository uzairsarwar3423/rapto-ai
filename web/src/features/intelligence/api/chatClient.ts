/**
 * chatClient.ts
 * ─────────────
 * Browser side of POST /api/ai/chat/query. Responsibilities, and nothing else:
 *
 *  - build the request; the SAME `client_message_id` is reused on Retry (idempotency, protocol §5)
 *  - 401 ⇒ refresh the access token once through the app's single-flight refresher, then retry once
 *  - one silent retry only when the network failed BEFORE any response (safe: idempotent id)
 *  - classify every failure into one of: ChatRequestError (pre-stream HTTP), ChatStreamError (network / watchdog /
 *    protocol / version), AbortError (the caller's own signal — Stop, navigation, logout)
 *  - idle watchdog: no bytes (server heartbeats count) for 35 s ⇒ abort + "Connection lost"
 *  - release the reader on every exit path
 *
 * No React, no stores: the stream manager owns state; this module is pure transport and fully unit-testable.
 */

import { CHAT_LIMITS, chatErrorBodySchema, normalizeErrorBodyCode, ProtocolError, ProtocolVersionError, type ChatErrorInfo, type ChatEvent, type ChatRequest } from "@/lib/contracts/chat";
import { readChatEvents } from "@/lib/sse/parseSSE";

export const CHAT_QUERY_URL = "/api/ai/chat/query";

/** The server answered with an HTTP error before opening a stream. */
export class ChatRequestError extends Error {
  readonly kind = "http" as const;
  constructor(readonly info: ChatErrorInfo) {
    super(info.message);
    this.name = "ChatRequestError";
  }
}

/** The stream broke after (or while) it was open. */
export class ChatStreamError extends Error {
  constructor(
    readonly reason: "network" | "watchdog" | "protocol" | "version" | "ended_early",
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ChatStreamError";
  }
}

export interface ChatClientDeps {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => string | null;
  /** Resolve a fresh access token (single-flight in the app) or null when the session is gone. */
  refreshAccessToken?: () => Promise<string | null>;
  idleTimeoutMs?: number;
  /** Delay before the single silent pre-response retry. */
  silentRetryDelayMs?: number;
  url?: string;
}

const isAbortError = (e: unknown): boolean => (e instanceof DOMException || e instanceof Error) && e.name === "AbortError";

export async function parseErrorResponse(res: Response): Promise<ChatErrorInfo> {
  let parsed: ReturnType<typeof chatErrorBodySchema.safeParse> | undefined;
  try {
    parsed = chatErrorBodySchema.safeParse(await res.json());
  } catch {
    parsed = undefined;
  }
  const header = Number(res.headers.get("retry-after"));
  if (parsed?.success) {
    const e = parsed.data.error;
    return {
      ...e,
      code: normalizeErrorBodyCode(e.code),
      status: res.status,
      retry_after_s: e.retry_after_s ?? (Number.isFinite(header) && header > 0 ? header : undefined),
      request_id: e.request_id ?? res.headers.get("x-request-id") ?? undefined,
    };
  }
  return {
    code: res.status === 401 ? "UNAUTHENTICATED" : "SERVICE_UNAVAILABLE",
    message: "Something went wrong.",
    retryable: res.status >= 500,
    status: res.status,
    request_id: res.headers.get("x-request-id") ?? undefined,
  };
}

/**
 * Open the stream and yield validated events. Throws ChatRequestError | ChatStreamError | AbortError.
 * Always ends the generator with the underlying body cancelled and released.
 */
export async function* streamChatQuery(
  request: ChatRequest,
  signal: AbortSignal,
  deps: ChatClientDeps = {},
): AsyncGenerator<ChatEvent, void, void> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const idleMs = deps.idleTimeoutMs ?? CHAT_LIMITS.watchdogMs;
  const url = deps.url ?? CHAT_QUERY_URL;

  // Internal controller: aborted by the caller's signal OR by the watchdog.
  const inner = new AbortController();
  let watchdogFired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      watchdogFired = true;
      inner.abort();
    }, idleMs);
  };
  const onOuterAbort = () => inner.abort();
  if (signal.aborted) inner.abort();
  else signal.addEventListener("abort", onOuterAbort, { once: true });

  try {
    arm(); // covers connect + time-to-headers as well
    const res = await openWithRetries(request, inner.signal, fetchImpl, url, deps);
    arm();
    if (!res.body) throw new ChatStreamError("network", "The response had no body.");

    try {
      for await (const event of readChatEvents(res.body, { signal: inner.signal, onActivity: arm })) yield event;
    } catch (e) {
      throw classifyStreamFailure(e, signal, watchdogFired);
    }
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (watchdogFired) throw new ChatStreamError("watchdog", "Connection lost.");
  } catch (e) {
    if (e instanceof ChatRequestError || e instanceof ChatStreamError) throw e;
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (watchdogFired) throw new ChatStreamError("watchdog", "Connection lost.");
    if (isAbortError(e)) throw e;
    throw new ChatStreamError("network", "Connection lost.", { cause: e });
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onOuterAbort);
    inner.abort(); // releases the connection if the generator is abandoned early
  }
}

function classifyStreamFailure(e: unknown, outer: AbortSignal, watchdogFired: boolean): unknown {
  if (outer.aborted) return new DOMException("Aborted", "AbortError");
  if (watchdogFired) return new ChatStreamError("watchdog", "Connection lost.");
  if (e instanceof ProtocolVersionError) return new ChatStreamError("version", "This version of the app is out of date.", { cause: e });
  if (e instanceof ProtocolError) return new ChatStreamError("protocol", "Received an unreadable response.", { cause: e });
  if (e instanceof ChatStreamError) return e;
  return new ChatStreamError("network", "Connection lost.", { cause: e });
}

async function openWithRetries(
  request: ChatRequest,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
  url: string,
  deps: ChatClientDeps,
): Promise<Response> {
  let refreshed = false;
  let silentlyRetried = false;
  let token = deps.getAccessToken?.() ?? null;

  for (;;) {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(request),
        signal,
        cache: "no-store",
        credentials: "same-origin",
      });
    } catch (e) {
      if (isAbortError(e) || signal.aborted) throw e;
      // Network failure before ANY response. The id is idempotent, so one silent retry is safe.
      if (!silentlyRetried) {
        silentlyRetried = true;
        await sleep(deps.silentRetryDelayMs ?? 400, signal);
        continue;
      }
      throw new ChatStreamError("network", "Connection lost.", { cause: e });
    }

    if (res.status === 401 && !refreshed && deps.refreshAccessToken) {
      refreshed = true;
      await res.body?.cancel().catch(() => undefined);
      const fresh = await deps.refreshAccessToken();
      if (fresh) {
        token = fresh;
        continue;
      }
      throw new ChatRequestError({ code: "UNAUTHENTICATED", message: "Your session has expired. Please sign in again.", retryable: false, status: 401 });
    }

    if (!res.ok) throw new ChatRequestError(await parseErrorResponse(res));
    return res;
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
