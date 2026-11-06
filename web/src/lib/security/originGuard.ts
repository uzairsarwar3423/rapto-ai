/**
 * security/originGuard.ts
 * ───────────────────────
 * CSRF defence for state-changing BFF routes.
 *
 *  1. `Sec-Fetch-Site` (sent by every current browser): only `same-origin` (and `none`, a direct navigation) pass.
 *     `same-site` is REJECTED on purpose: sibling subdomains (e.g. the marketing site) must not be able to act as a
 *     signed-in user.
 *  2. Otherwise the `Origin` header must equal the request's own origin (or the configured app origin).
 *  3. A request with neither header is only allowed if it carries an explicit `Authorization` header — a header a
 *     cross-site form/img/fetch-no-cors request cannot set, so it is not CSRF-able.
 *
 * Reads are not guarded (they are safe methods and responses are not readable cross-origin).
 */

import { ChatHttpError } from "@/lib/ai/chatErrors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function requestOrigins(req: Request, extra: string[]): Set<string> {
  const origins = new Set<string>(extra.filter(Boolean).map((o) => o.replace(/\/$/, "")));
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
    origins.add(`${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`);
  }
  try {
    origins.add(new URL(req.url).origin);
  } catch {
    /* relative/invalid URL in a unit test */
  }
  return origins;
}

export function assertSameOrigin(req: Request, opts: { extraOrigins?: string[] } = {}): void {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return;

  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite) {
    if (fetchSite === "same-origin" || fetchSite === "none") return;
    throw new ChatHttpError("BAD_ORIGIN");
  }

  const origin = req.headers.get("origin");
  if (origin) {
    const allowed = requestOrigins(req, opts.extraOrigins ?? [process.env.NEXT_PUBLIC_APP_URL ?? ""]);
    if (allowed.has(origin.replace(/\/$/, ""))) return;
    throw new ChatHttpError("BAD_ORIGIN");
  }

  if (req.headers.get("authorization")) return;
  throw new ChatHttpError("BAD_ORIGIN");
}

/** JSON-only bodies: a `text/plain` or form post is the classic CSRF vehicle, so it is refused outright. */
export function assertJsonContentType(req: Request): void {
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!ct.startsWith("application/json")) throw new ChatHttpError("UNSUPPORTED_MEDIA_TYPE");
}
