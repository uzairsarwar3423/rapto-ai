/**
 * detectPlatform() — Analyzes meeting URLs and returns the corresponding platform.
 */
export function detectPlatform(url: string): "ZOOM" | "GOOGLE_MEET" | "TEAMS" | "WEBEX" | null {
  if (!url) return null

  // Regex patterns for each supported platform
  const zoomRegex = /zoom\.us\/(j|my)\/\d+/i
  const meetRegex = /meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i
  const teamsRegex = /teams\.(microsoft|live)\.com/i
  const webexRegex = /webex\.com\/(meet|join)/i

  if (zoomRegex.test(url)) return "ZOOM"
  if (meetRegex.test(url)) return "GOOGLE_MEET"
  if (teamsRegex.test(url)) return "TEAMS"
  if (webexRegex.test(url)) return "WEBEX"

  return null
}
