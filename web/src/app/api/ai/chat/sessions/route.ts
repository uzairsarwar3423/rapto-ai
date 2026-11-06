/** GET /api/ai/chat/sessions?limit&cursor  →  AI service  GET /chat/sessions  (newest first, opaque cursor) */
import { proxyJson } from "@/lib/ai/proxy";
import { chatRoute, parseCursor, parseLimit } from "@/lib/ai/route";
import { sessionListSchema } from "@/lib/contracts/chat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = chatRoute(async (ctx) => {
  const url = new URL(ctx.req.url);
  return proxyJson(ctx, {
    method: "GET",
    path: "/chat/sessions",
    query: { limit: parseLimit(url.searchParams.get("limit"), 20), cursor: parseCursor(url.searchParams.get("cursor")) },
    schema: sessionListSchema,
  });
});
