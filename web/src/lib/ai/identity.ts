import "server-only";

/**
 * ai/identity.ts
 * ──────────────
 * Resolves WHO is calling, server-side, from the session only. The browser never supplies team/user/role/plan/tz.
 *
 * The Express access token is an HS256 JWT signed with a secret the web app must not hold, so the BFF cannot verify it
 * locally. Instead it asks Express (`GET /api/v1/auth/me`) — which verifies the token AND returns the *current* role,
 * team, plan and timezone (so a demoted/removed member loses access within the cache TTL, not at token expiry).
 *
 * Calls are cached briefly per token (hash only — raw tokens are never used as keys) and de-duplicated while in flight,
 * so the burst of requests a chat page makes (history + suggestions + stream) costs one Express call.
 */

import { createHash } from "node:crypto";
import { getServerApiUrl } from "@/lib/api/config";
import { ChatHttpError } from "./chatErrors";

export interface ChatIdentity {
  userId: string;
  teamId: string;
  role: string;
  /** Plan in the AI service's vocabulary (FREE | PRO | BUSINESS | ENTERPRISE). */
  plan: string;
  /** Plan as Express reports it (for display/telemetry decisions only). */
  rawPlan: string;
  tz: string;
  name: string | null;
}

const ACCESS_COOKIE = "rapto_access";
const CACHE_TTL_MS = 20_000;
const CACHE_MAX = 1_000;
const IDENTITY_TIMEOUT_MS = 5_000;

/**
 * Express plan → AI-service plan.
 *
 * The AI service gives `FREE` the free limits, `PRO` the pro limits and EVERY OTHER value the *business* limits. Express
 * has plans the AI service does not know (STARTER, GROWTH); passing them through verbatim would silently hand those
 * teams business-tier quota and output caps. So the mapping is explicit, and anything unknown falls to the most
 * restrictive tier. Confirm the STARTER/GROWTH → PRO decision with billing before GA.
 */
export function mapPlanForChat(raw: string | null | undefined): string {
  switch ((raw ?? "").toUpperCase()) {
    case "FREE":
      return "FREE";
    case "STARTER":
    case "GROWTH":
    case "PRO":
      return "PRO";
    case "BUSINESS":
      return "BUSINESS";
    case "ENTERPRISE":
      return "ENTERPRISE";
    default:
      return "FREE";
  }
}

export function sanitizeTimezone(tz: unknown): string {
  if (typeof tz !== "string" || !tz.trim() || tz.length > 64) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

export function extractAccessToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth && /^bearer /i.test(auth)) {
    const t = auth.slice(7).trim();
    if (t) return t;
  }
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === ACCESS_COOKIE) {
      const value = part.slice(idx + 1).trim();
      try {
        return decodeURIComponent(value) || null;
      } catch {
        return value || null;
      }
    }
  }
  return null;
}

const cache = new Map<string, { identity: ChatIdentity; expires: number }>();
const inflight = new Map<string, Promise<ChatIdentity>>();

/** Test hook. */
export function __resetIdentityCache(): void {
  cache.clear();
  inflight.clear();
}

async function fetchIdentity(token: string, apiBaseUrl: string): Promise<ChatIdentity> {
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(IDENTITY_TIMEOUT_MS),
    });
  } catch {
    throw new ChatHttpError("SERVICE_UNAVAILABLE", { retryable: true });
  }

  if (res.status === 401) throw new ChatHttpError("UNAUTHENTICATED");
  if (res.status === 403) throw new ChatHttpError("FORBIDDEN");
  if (!res.ok) throw new ChatHttpError("SERVICE_UNAVAILABLE", { retryable: true });

  let user: Record<string, unknown> | undefined;
  try {
    const json = (await res.json()) as { data?: { user?: Record<string, unknown> } };
    user = json?.data?.user;
  } catch {
    throw new ChatHttpError("SERVICE_UNAVAILABLE", { retryable: true });
  }

  const userId = typeof user?.id === "string" ? user.id : "";
  const teamId = typeof user?.teamId === "string" ? user.teamId : "";
  if (!userId) throw new ChatHttpError("UNAUTHENTICATED");
  if (!teamId) throw new ChatHttpError("FORBIDDEN", { message: "Join or create a team to use chat." });

  const team = (user?.team ?? null) as { plan?: unknown } | null;
  const rawPlan = typeof team?.plan === "string" ? team.plan : "FREE";
  return {
    userId,
    teamId,
    role: typeof user?.role === "string" && user.role ? user.role : "MEMBER",
    plan: mapPlanForChat(rawPlan),
    rawPlan,
    tz: sanitizeTimezone(user?.timezone),
    name: typeof user?.name === "string" ? user.name : null,
  };
}

export async function resolveChatIdentity(req: Request, opts: { apiBaseUrl?: string } = {}): Promise<ChatIdentity> {
  const token = extractAccessToken(req);
  if (!token) throw new ChatHttpError("UNAUTHENTICATED");

  const key = createHash("sha256").update(token).digest("hex");
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.identity;

  const pending = inflight.get(key);
  if (pending) return pending;

  const p = fetchIdentity(token, opts.apiBaseUrl ?? getServerApiUrl())
    .then((identity) => {
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
      cache.set(key, { identity, expires: Date.now() + CACHE_TTL_MS });
      return identity;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
