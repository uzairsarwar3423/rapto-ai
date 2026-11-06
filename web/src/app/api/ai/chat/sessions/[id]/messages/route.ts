/**
 * GET /api/ai/chat/sessions/{id}/messages?limit&cursor  →  GET /chat/sessions/{id}/messages
 *
 * Items are chronological within a page; `next_cursor` pages toward OLDER messages. Source previews of meetings the
 * caller can no longer see arrive blanked (`redacted: true`) — access is re-checked by the AI service on every read.
 */
import { proxyJson } from "@/lib/ai/proxy";
import { assertId, chatRoute, parseCursor, parseLimit } from "@/lib/ai/route";
import { messageListSchema } from "@/lib/contracts/chat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = chatRoute<{ id: string }>(async (ctx) => {
  const id = assertId(ctx.params.id);
  const url = new URL(ctx.req.url);
  return proxyJson(ctx, {
    method: "GET",
    path: `/chat/sessions/${encodeURIComponent(id)}/messages`,
    query: { limit: parseLimit(url.searchParams.get("limit"), 30), cursor: parseCursor(url.searchParams.get("cursor")) },
    schema: messageListSchema,
  });
});
