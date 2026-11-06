/** GET /api/ai/chat/suggestions  →  GET /chat/suggestions  (4–6 deterministic, data-aware starter questions) */
import { proxyJson } from "@/lib/ai/proxy";
import { chatRoute } from "@/lib/ai/route";
import { suggestionListSchema } from "@/lib/contracts/chat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = chatRoute(async (ctx) => proxyJson(ctx, { method: "GET", path: "/chat/suggestions", schema: suggestionListSchema }));
