/**
 * utc-date.ts — the Day-Boundary Rule, in code.
 *
 * Every "day" in the admin metrics engine is a UTC calendar day. `2026-11-10` means
 * [2026-11-10T00:00Z, 2026-11-11T00:00Z). All helpers here use UTC arithmetic only — never the server's local
 * timezone — so a worker running in UTC+5 and one running in UTC produce identical rows.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

export function assertIsoDate(d: string): string {
  if (!ISO_DATE.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) {
    throw new Error(`Invalid ISO date "${d}" (expected YYYY-MM-DD)`)
  }
  return d
}

export const utcToday = (now: Date = new Date()): string => now.toISOString().slice(0, 10)

export const dayStart = (d: string): Date => new Date(`${assertIsoDate(d)}T00:00:00.000Z`)

/** Exclusive upper bound of the day: start of the next UTC day. */
export const dayEndExclusive = (d: string): Date => new Date(dayStart(d).getTime() + DAY_MS)

export const addDaysUtc = (d: string, days: number): string =>
  new Date(dayStart(d).getTime() + days * DAY_MS).toISOString().slice(0, 10)

export const prevDay = (d: string): string => addDaysUtc(d, -1)

/** Inclusive list of ISO dates from `from` to `to`. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = assertIsoDate(from); d <= assertIsoDate(to); d = addDaysUtc(d, 1)) out.push(d)
  return out
}

export const daysBetween = (from: string, to: string): number =>
  Math.round((dayStart(to).getTime() - dayStart(from).getTime()) / DAY_MS)
