/**
 * PATCH  /api/ai/chat/sessions/{id}  {title}  →  PATCH  /chat/sessions/{id}
 * DELETE /api/ai/chat/sessions/{id}           →  DELETE /chat/sessions/{id}   (soft delete, idempotent, 204)
 *
 * `{id}` is validated against the backend id grammar and percent-encoded before it touches the upstream path. A
 * session that belongs to someone else is an upstream 404, surfaced as a plain 404 (no existence oracle).
 */
import { proxyJson } from "@/lib/ai/proxy";
import { assertId, chatRoute, readJsonBody, validationError } from "@/lib/ai/route";
import { renameRequestSchema, sessionSchema } from "@/lib/contracts/chat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { id: string };

export const PATCH = chatRoute<Params>(
  async (ctx) => {
    const id = assertId(ctx.params.id);
    const parsed = renameRequestSchema.safeParse(await readJsonBody(ctx.req));
    if (!parsed.success) throw validationError(parsed.error);
    return proxyJson(ctx, { method: "PATCH", path: `/chat/sessions/${encodeURIComponent(id)}`, body: parsed.data, schema: sessionSchema });
  },
  { mutating: true, json: true },
);

export const DELETE = chatRoute<Params>(
  async (ctx) => {
    const id = assertId(ctx.params.id);
    return proxyJson(ctx, { method: "DELETE", path: `/chat/sessions/${encodeURIComponent(id)}` });
  },
  { mutating: true },
);
