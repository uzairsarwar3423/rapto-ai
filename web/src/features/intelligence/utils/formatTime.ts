/**
 * formatTime.ts — timestamps for citations and messages.
 *  - `m:ss` under an hour, `h:mm:ss` from one hour (meetings run long; `mm:ss` would show 75:00).
 *  - Absolute dates use the viewer's timezone (the `tz` claim is the user's `timezone`, so answer text and UI agree — D-9).
 */

export function formatTimestamp(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Whole seconds for `?t=` deep links. */
export const msToSeconds = (ms: number): number => Math.max(0, Math.floor(ms / 1000));

function safeFormat(date: Date, locale: string | undefined, opts: Intl.DateTimeFormatOptions): string | null {
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(locale, opts).format(date);
  } catch {
    // Unknown timezone string: fall back to the browser's zone rather than failing the render.
    const { timeZone: _ignored, ...rest } = opts;
    void _ignored;
    return new Intl.DateTimeFormat(locale, rest).format(date);
  }
}

/** Date-only strings (`2026-11-03`) are calendar dates, not instants: format them without timezone shifting. */
export function formatDate(value: string | null | undefined, tz?: string | null, locale?: string): string | null {
  if (!value) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T12:00:00Z` : value);
  return safeFormat(date, locale, { month: "short", day: "numeric", year: "numeric", timeZone: dateOnly ? "UTC" : tz ?? undefined });
}

export function formatDateTime(value: string | Date | null | undefined, tz?: string | null, locale?: string): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return safeFormat(date, locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz ?? undefined });
}

export function formatClock(value: string | Date | null | undefined, tz?: string | null, locale?: string): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return safeFormat(date, locale, { hour: "numeric", minute: "2-digit", timeZone: tz ?? undefined });
}

/** YYYY-MM-DD of an instant in a given timezone (for day grouping). */
export function dayKey(value: string | Date, tz?: string | null): string {
  const date = value instanceof Date ? value : new Date(value);
  try {
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: tz ?? undefined }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  }
}
