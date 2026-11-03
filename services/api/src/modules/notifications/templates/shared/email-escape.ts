/**
 * HTML-escaping helpers for transactional emails.
 *
 * Every dynamic value (names, team names, commitment text, summaries, URLs …) is user- or system-supplied and MUST
 * pass through one of these before it is interpolated into markup. Static copy written in the templates is trusted
 * and is not escaped.
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Escape text for an HTML text node or a quoted attribute value. null/undefined → ''. */
export function esc(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch])
}

const SAFE_URL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:'])

/**
 * Validate and escape a URL for an `href` attribute.
 * Only http(s) and mailto are allowed — `javascript:`, `data:`, `vbscript:` and relative/garbage values become '#'.
 */
export function safeUrl(url: unknown): string {
  if (typeof url !== 'string') return '#'
  const trimmed = url.trim()
  if (!trimmed) return '#'
  try {
    const parsed = new URL(trimmed)
    if (!SAFE_URL_PROTOCOLS.has(parsed.protocol)) return '#'
  } catch {
    return '#'
  }
  return esc(trimmed)
}
