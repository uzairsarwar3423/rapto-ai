import "server-only";

/**
 * ai/proxy.ts
 * ───────────
 * The only code that talks to the AI service. Guarantees (each covered by tests/bff):
 *
 *  - The upstream URL is `<fixed base> + <path built by this module from validated parts>`; request data can never
 *    choose host, scheme or path prefix.
 *  - A fresh ≤60 s service JWT per call; identity comes from `ctx.identity` only.
 *  - JSON routes: bounded timeout, non-OK ⇒ normalised envelope, OK body ⇒ re-validated and re-serialised through a
 *    response schema (unexpected fields are dropped, a malformed body becomes a 503 — never forwarded raw).
 *  - Stream route: the upstream body is piped UNTOUCHED (ADR-1) with zero extra buffering, and cancellation propagates
 *    on BOTH paths — (1) the incoming request's abort signal and (2) the client cancelling the response body — so the
 *    model stops generating (and stops billing) when the user presses Stop, closes the tab or loses connectivity.
 */

import type { ZodType } from "zod";
import type { ChatRequest } from "@/lib/contracts/chat";
import type { ChatServerConfig } from "./chatConfig";
import { ChatHttpError, normalizeUpstreamError } from "./chatErrors";
import type { ChatIdentity } from "./identity";
import { mintChatToken } from "./internalToken";

export interface ProxyContext {
  req: Request;
  identity: ChatIdentity;
  requestId: string;
  cfg: ChatServerConfig;
}

const JSON_TIMEOUT_MS = 10_000;
/** Backend total timeout is 45 s; leave room for preflight and the final events. */
export const STREAM_MAX_MS = 75_000;
const MAX_JSON_BYTES = 1024 * 1024;

export function privateHeaders(requestId: string, extra: Record<string, string> = {}): Headers {
  return new Headers({ "Cache-Control": "private, no-store, max-age=0", "X-Request-Id": requestId, ...extra });
}

function upstreamHeaders(ctx: ProxyContext, accept: string, hasBody: boolean): Headers {
  const token = mintChatToken(
    {
      team_id: ctx.identity.teamId,
      user_id: ctx.identity.userId,
      role: ctx.identity.role,
      plan: ctx.identity.plan,
      tz: ctx.identity.tz,
      rid: ctx.requestId,
    },
    ctx.cfg,
  );
  const h = new Headers({ Authorization: `Bearer ${token}`, Accept: accept, "X-Request-Id": ctx.requestId });
  if (hasBody) h.set("Content-Type", "application/json");
  return h;
}

const isAbort = (e: unknown): boolean => e instanceof DOMException && (e.name === "AbortError" || e.name === "TimeoutError");

async function upstreamFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: "no-store", redirect: "manual" });
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") throw new ChatHttpError("SERVICE_UNAVAILABLE", { status: 504, retryable: true });
    if (isAbort(e)) throw e; // the client went away: the route wrapper turns this into an empty response
    throw new ChatHttpError("SERVICE_UNAVAILABLE", { retryable: true }); // DNS / refused / reset: no internals leak
  }
}

export interface JsonProxyOptions<T> {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** Path below the AI base, already built from validated parts (e.g. `/chat/sessions/abc/messages`). */
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** Response schema. Omit only for 204 routes. */
  schema?: ZodType<T>;
  timeoutMs?: number;
}

export async function proxyJson<T>(ctx: ProxyContext, opts: JsonProxyOptions<T>): Promise<Response> {
  const url = new URL(ctx.cfg.aiBaseUrl + opts.path);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));

  const hasBody = opts.body !== undefined;
  const res = await upstreamFetch(url.toString(), {
    method: opts.method,
    headers: upstreamHeaders(ctx, "application/json", hasBody),
    body: hasBody ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.any([ctx.req.signal, AbortSignal.timeout(opts.timeoutMs ?? JSON_TIMEOUT_MS)]),
  });

  if (!res.ok) throw await normalizeUpstreamError(res);
  if (res.status === 204) return new Response(null, { status: 204, headers: privateHeaders(ctx.requestId) });

  let parsed: unknown;
  try {
    const text = await res.text();
    if (text.length > MAX_JSON_BYTES) throw new Error("upstream body too large");
    parsed = JSON.parse(text);
  } catch (e) {
    if (isAbort(e)) throw e;
    console.error("[chat-bff] upstream returned an unreadable JSON body for", opts.path);
    throw new ChatHttpError("SERVICE_UNAVAILABLE", { retryable: true });
  }

  let payload: unknown = parsed;
  if (opts.schema) {
    const checked = opts.schema.safeParse(parsed);
    if (!checked.success) {
      console.error("[chat-bff] upstream response failed validation for", opts.path, checked.error.issues[0]?.message);
      throw new ChatHttpError("SERVICE_UNAVAILABLE", { retryable: true });
    }
    payload = checked.data;
  }
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: privateHeaders(ctx.requestId, { "Content-Type": "application/json; charset=utf-8" }),
  });
}

/** What the upstream receives: rebuilt field by field from validated data, so unknown/hostile fields cannot ride along. */
export function toUpstreamChatBody(r: ChatRequest): Record<string, unknown> {
  return {
    session_id: r.session_id ?? null,
    message: r.message,
    client_message_id: r.client_message_id,
    filters: {
      meeting_ids: r.filters.meeting_ids,
      speaker_ids: r.filters.speaker_ids,
      date_from: r.filters.date_from ?? null,
      date_to: r.filters.date_to ?? null,
    },
  };
}

export function streamHeaders(requestId: string): Headers {
  return new Headers({
    "Content-Type": "text/event-stream; charset=utf-8",
    // no-transform stops compression middleware and intermediaries from re-encoding (and therefore buffering) the stream.
    "Cache-Control": "private, no-cache, no-store, no-transform",
    "Content-Encoding": "identity",
    "X-Accel-Buffering": "no",
    "X-Request-Id": requestId,
  });
}

export async function proxyStream(ctx: ProxyContext, body: ChatRequest): Promise<Response> {
  const abort = new AbortController();
  // Cancellation path 1: the incoming request is aborted (client disconnect, fetch abort, navigation).
  const onRequestAbort = () => abort.abort(ctx.req.signal.reason);
  if (ctx.req.signal.aborted) abort.abort(ctx.req.signal.reason);
  else ctx.req.signal.addEventListener("abort", onRequestAbort, { once: true });

  let upstream: Response;
  try {
    upstream = await upstreamFetch(ctx.cfg.aiBaseUrl + "/chat/query", {
      method: "POST",
      headers: upstreamHeaders(ctx, "text/event-stream", true),
      body: JSON.stringify(toUpstreamChatBody(body)),
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(STREAM_MAX_MS)]),
    });
  } catch (e) {
    ctx.req.signal.removeEventListener("abort", onRequestAbort);
    throw e;
  }

  const isStream = upstream.ok && (upstream.headers.get("content-type") ?? "").toLowerCase().startsWith("text/event-stream") && upstream.body;
  if (!isStream) {
    ctx.req.signal.removeEventListener("abort", onRequestAbort);
    if (upstream.ok) {
      await upstream.body?.cancel().catch(() => undefined);
      console.error("[chat-bff] /chat/query returned 2xx without an event stream");
      throw new ChatHttpError("SERVICE_UNAVAILABLE", { retryable: true });
    }
    throw await normalizeUpstreamError(upstream);
  }

  const reader = upstream.body!.getReader();
  const out = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            ctx.req.signal.removeEventListener("abort", onRequestAbort);
            controller.close();
          } else {
            controller.enqueue(value);
          }
        } catch (e) {
          // Upstream broke mid-stream. Error the response so the browser sees a dropped connection (→ Retry, which the
          // backend answers by replay or rerun) rather than a silently truncated "successful" answer.
          ctx.req.signal.removeEventListener("abort", onRequestAbort);
          controller.error(e);
        }
      },
      // Cancellation path 2: the client cancelled/closed the RESPONSE body. Abort the upstream request itself, so the
      // AI service sees the disconnect and stops generating.
      cancel(reason) {
        ctx.req.signal.removeEventListener("abort", onRequestAbort);
        abort.abort(reason);
        return reader.cancel(reason).catch(() => undefined);
      },
    },
    { highWaterMark: 0 }, // pull-driven: never read ahead of the consumer
  );

  return new Response(out, { status: 200, headers: streamHeaders(ctx.requestId) });
}
