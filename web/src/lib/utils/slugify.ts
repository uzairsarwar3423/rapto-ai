/**
 * slugify() — Converts a string into a URL-friendly slug.
 *
 * Example:
 *   slugify("Hello World! This is Vocaply.") -> "hello-world-this-is-vocaply"
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/[^\w\-]+/g, "") // Remove all non-word characters except hyphens
    .replace(/\-\-+/g, "-") // Replace multiple hyphens with a single hyphen
    .replace(/^-+/, "") // Trim hyphens from the start
    .replace(/-+$/, "") // Trim hyphens from the end
}
