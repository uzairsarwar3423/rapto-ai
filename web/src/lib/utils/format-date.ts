import { format, formatDistanceToNow, parseISO } from "date-fns"

/**
 * formatDate() — Formats dates to short, long, or relative representations.
 */
export function formatDate(
  date: Date | string,
  type: "short" | "long" | "relative" = "short"
): string {
  try {
    const parsedDate = typeof date === "string" ? parseISO(date) : date

    if (type === "relative") {
      return formatRelativeTime(parsedDate)
    }

    if (type === "long") {
      return format(parsedDate, "MMMM d, yyyy")
    }

    return format(parsedDate, "MMM d, yyyy")
  } catch (e) {
    return String(date)
  }
}

/**
 * formatRelativeTime() — Returns relative time string like "2 hours ago" or "3 days ago".
 */
export function formatRelativeTime(date: Date | string): string {
  try {
    const parsedDate = typeof date === "string" ? parseISO(date) : date
    return formatDistanceToNow(parsedDate, { addSuffix: true })
  } catch (e) {
    return "just now"
  }
}

/**
 * formatDuration() — Converts minutes to formats like "28 min" or "1h 12min".
 */
export function formatDuration(minutes: number): string {
  if (minutes < 0) return "0 min"

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  if (hours > 0) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}min` : `${hours}h`
  }

  return `${remainingMinutes} min`
}
