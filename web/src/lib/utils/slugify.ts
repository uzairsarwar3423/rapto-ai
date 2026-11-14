export const SLUG_MIN_LENGTH = 2;
export const SLUG_MAX_LENGTH = 50;

/**
 * slugify() — Converts free text into a URL-friendly workspace slug.
 *
 * Mirrors the API's rules (services/api/src/utils/slug.ts) so what the user sees
 * while typing is what the server would generate:
 *   - lowercase, a-z / 0-9 / hyphen only
 *   - spaces and underscores become hyphens, accents are stripped
 *   - unsupported characters are removed, repeated hyphens collapsed
 *   - no leading / trailing hyphen, at most 50 characters
 *
 * Examples:
 *   slugify("Uzair")                    -> "uzair"
 *   slugify("My Team")                  -> "my-team"
 *   slugify("Rapto AI")                 -> "rapto-ai"
 *   slugify("Hello World! This is Rapto.") -> "hello-world-this-is-rapto"
 *   slugify("Café Über")                -> "cafe-uber"
 */
export function slugify(text: string): string {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // Strip accents
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, "") // Remove unsupported characters
    .replace(/[\s_]+/g, "-") // Spaces / underscores -> hyphen
    .replace(/-+/g, "-") // Collapse repeated hyphens
    .replace(/^-+/, "") // Trim hyphens from the start
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, ""); // Trim again: slice may expose a trailing hyphen
}

/**
 * Light-touch sanitising for a slug the user is typing by hand. Unlike slugify()
 * it keeps a trailing hyphen so "my-" can become "my-team" without the cursor
 * fighting the user; call slugify() on blur / submit to finish the job.
 */
export function sanitizeSlugInput(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .slice(0, SLUG_MAX_LENGTH);
}
