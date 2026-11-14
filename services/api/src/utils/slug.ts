// ─────────────────────────────────────────────────────────────────────────────
// slug.ts — Workspace slug rules (single source of truth for the API)
//
// A slug is lowercase a-z / 0-9 / hyphen, 2–50 chars, never starting or ending
// with a hyphen. These match the Zod validators in teams.validator.ts and the
// web client's slugify (web/src/lib/utils/slugify.ts).
// ─────────────────────────────────────────────────────────────────────────────

export const SLUG_MIN_LENGTH = 2
export const SLUG_MAX_LENGTH = 50
export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/

/** Used when a name yields nothing usable (e.g. "!!!" or a single character). */
export const FALLBACK_SLUG_BASE = 'workspace'

/**
 * Turn free text into a URL slug.
 *   "Rapto AI"      -> "rapto-ai"
 *   "  My   Team! "  -> "my-team"
 *   "Café Über"      -> "cafe-uber"
 *   "--a__b--"       -> "a-b"
 * Returns '' when nothing usable remains.
 */
export function slugify(text: string): string {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '') // drop unsupported characters
    .replace(/[\s_]+/g, '-') // spaces / underscores -> hyphen
    .replace(/-+/g, '-') // collapse runs
    .replace(/^-+/, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, '') // trim again: slice may expose a trailing hyphen
}

export function isValidSlug(slug: string): boolean {
  return (
    slug.length >= SLUG_MIN_LENGTH &&
    slug.length <= SLUG_MAX_LENGTH &&
    SLUG_REGEX.test(slug)
  )
}

/**
 * Normalise arbitrary input into a valid base slug. Always returns something
 * that passes isValidSlug().
 */
export function toBaseSlug(text: string): string {
  const slug = slugify(text)
  if (isValidSlug(slug)) return slug
  return slug ? `${slug}-${FALLBACK_SLUG_BASE}` : FALLBACK_SLUG_BASE
}

/**
 * `base-n`, trimmed so the result never exceeds SLUG_MAX_LENGTH.
 *   withSuffix("uzair", 2) -> "uzair-2"
 */
export function withSuffix(base: string, n: number): string {
  const suffix = `-${n}`
  const room = SLUG_MAX_LENGTH - suffix.length
  return `${base.slice(0, room).replace(/-+$/, '')}${suffix}`
}
