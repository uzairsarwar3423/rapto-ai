/**
 * POST /api/ai/chat/query  →  AI service  POST /chat/query   (SSE)
 *
 * Authenticated by the user's session; the BFF mints the service JWT. The response body is the upstream event stream,
 * piped untouched. Pre-stream failures (401/403/404/409/422/429/503…) come back as the normalised JSON envelope with a
 * real HTTP status, exactly like the AI service's own preflight (docs/chat/sse_protocol_v1.md §6).
 */
import { proxyStream } from "@/lib/ai/proxy";
import { chatRoute, readJsonBody, validationError } from "@/lib/ai/route";
import { chatRequestSchema } from "@/lib/contracts/chat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Must exceed the AI service's total timeout (45 s) plus preflight. */
export const maxDuration = 90;

export const POST = chatRoute(
  async (ctx) => {
    const parsed = chatRequestSchema.safeParse(await readJsonBody(ctx.req));
    if (!parsed.success) throw validationError(parsed.error);
    // `team_id`, `user_id` or anything else the browser may have added was stripped by the schema and is never
    // forwarded: identity is `ctx.identity`, resolved from the session.
    return proxyStream(ctx, parsed.data);
  },
  { mutating: true, json: true },
);
