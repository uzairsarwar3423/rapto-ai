/** POST /api/ai/chat/messages/{id}/feedback {rating, reason?, comment?}  →  POST /chat/messages/{id}/feedback (upsert, 204) */
import { proxyJson } from "@/lib/ai/proxy";
import { assertId, chatRoute, readJsonBody, validationError } from "@/lib/ai/route";
import { feedbackRequestSchema } from "@/lib/contracts/chat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = chatRoute<{ id: string }>(
  async (ctx) => {
    const id = assertId(ctx.params.id);
    const parsed = feedbackRequestSchema.safeParse(await readJsonBody(ctx.req));
    if (!parsed.success) throw validationError(parsed.error);
    const { rating, reason, comment } = parsed.data;
    return proxyJson(ctx, {
      method: "POST",
      path: `/chat/messages/${encodeURIComponent(id)}/feedback`,
      body: { rating, reason: reason ?? null, comment: comment ?? null },
    });
  },
  { mutating: true, json: true },
);
