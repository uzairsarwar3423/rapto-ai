import "server-only";

/**
 * ai/route.ts — shared wrapper + validators for every /api/ai/chat/* route handler.
 *
 * Order of checks (cheapest and most security-relevant first, nothing reaches the AI service before all pass):
 *   CSRF origin guard (mutating) → content type (bodies) → server config → authenticated identity → handler.
 * Every failure leaves through the one error envelope; unexpected exceptions are logged and become a generic 500.
 */

import { ID_PATTERN } from "@/lib/contracts/chat";
import { assertJsonContentType, assertSameOrigin } from "@/lib/security/originGuard";
import { getChatServerConfig, type ChatServerConfig } from "./chatConfig";
import { ChatHttpError, errorResponse, toChatHttpError } from "./chatErrors";
import { resolveChatIdentity, type ChatIdentity } from "./identity";

export interface ChatRouteContext<P = Record<string, never>> {
  req: Request;
  identity: ChatIdentity;
  requestId: string;
  cfg: ChatServerConfig;
  params: P;
}

export interface ChatRouteOptions {
  /** State-changing route: enforce the CSRF origin guard. */
  mutating?: boolean;
  /** Route takes a JSON body: enforce the content type. */
  json?: boolean;
}

type NextCtx<P> = { params: Promise<P> } | undefined;

const isAbortError = (e: unknown): boolean => e instanceof DOMException && e.name === "AbortError";

export function chatRoute<P = Record<string, never>>(
  handler: (ctx: ChatRouteContext<P>) => Promise<Response>,
  opts: ChatRouteOptions = {},
): (req: Request, nextCtx?: NextCtx<P>) => Promise<Response> {
  return async (req, nextCtx) => {
    const requestId = crypto.randomUUID();
    try {
      if (opts.mutating) assertSameOrigin(req);
      if (opts.json) assertJsonContentType(req);
      const cfg = getChatServerConfig();
      const identity = await resolveChatIdentity(req, { apiBaseUrl: cfg.apiBaseUrl });
      const params = (nextCtx ? await nextCtx.params : {}) as P;
      return await handler({ req, identity, requestId, cfg, params });
    } catch (e) {
      // The client went away mid-flight: there is nobody to answer. 499 (nginx convention) keeps logs honest.
      if (isAbortError(e) || req.signal.aborted) return new Response(null, { status: 499 });
      return errorResponse(toChatHttpError(e), requestId);
    }
  };
}

// ─── Validators ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Backend ids are `[A-Za-z0-9_-]{1,64}`. Anything else is a probe: 404, before any upstream call. */
export function assertId(value: unknown): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw new ChatHttpError("NOT_FOUND");
  return value;
}

/** Opaque signed cursor: `base64url(body).base64url(sig)`. */
const CURSOR_PATTERN = /^[A-Za-z0-9_.-]{1,512}$/;
export function parseCursor(raw: string | null): string | undefined {
  if (raw === null || raw === "") return undefined;
  if (!CURSOR_PATTERN.test(raw)) throw new ChatHttpError("INVALID_INPUT", { field: "cursor", message: "Invalid cursor." });
  return raw;
}

export function parseLimit(raw: string | null, def: number, max = 50): number {
  if (raw === null || raw === "") return def;
  if (!/^\d{1,3}$/.test(raw)) throw new ChatHttpError("INVALID_INPUT", { field: "limit", message: "Invalid limit." });
  return Math.min(Math.max(Number(raw), 1), max);
}

const MAX_BODY_BYTES = 16 * 1024;

/** Read a JSON body with a hard size cap (never trust Content-Length alone). */
export async function readJsonBody(req: Request, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new ChatHttpError("INVALID_INPUT", { status: 413, message: "Request body is too large." });
  const reader = req.body?.getReader();
  if (!reader) throw new ChatHttpError("INVALID_INPUT", { message: "A JSON body is required." });
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ChatHttpError("INVALID_INPUT", { status: 413, message: "Request body is too large." });
    }
    chunks.push(value);
  }
  const text = new TextDecoder().decode(Buffer.concat(chunks));
  try {
    return JSON.parse(text);
  } catch {
    throw new ChatHttpError("INVALID_INPUT", { message: "The request body is not valid JSON." });
  }
}

/** Turn a zod failure into a field-level 422 (first issue only; messages are ours, not user-controlled). */
export function validationError(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): ChatHttpError {
  const issue = error.issues[0];
  const field = issue?.path.map(String).join(".") || undefined;
  return new ChatHttpError("INVALID_INPUT", { field, message: issue?.message?.slice(0, 200) ?? "Invalid request." });
}
