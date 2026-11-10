import { Prisma } from '@prisma/client'

/**
 * Keyset (cursor) pagination — the ONLY pagination mechanism for the admin surface (Users, Teams, Subscriptions).
 *
 * OFFSET 50000 makes Postgres read and discard 50,000 rows on every request, and rows shift between pages whenever
 * data changes. Keyset seeks straight to the position via the (sort column, id) index and stays O(log n) at any depth.
 */

/** `s` = the sort this cursor belongs to, so a cursor from a different sort/filter shape is rejected, not misread. */
export interface Cursor {
  v: string | number
  id: string
  s: string
}

export const encodeCursor = (c: Cursor): string => Buffer.from(JSON.stringify(c)).toString('base64url')

/** Malformed, foreign or tampered cursor → null → treated as "first page". The endpoint never 500s on user input. */
export function decodeCursor(raw: string | undefined, expectedSort: string): Cursor | null {
  if (!raw) return null
  try {
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString())
    const validValue = typeof c?.v === 'string' || (typeof c?.v === 'number' && Number.isFinite(c.v))
    if (typeof c?.id !== 'string' || !validValue || c?.s !== expectedSort) return null
    return c as Cursor
  } catch {
    return null
  }
}

/** A whitelisted sortable column: its SQL expression and the Postgres type the cursor value is cast to. */
export interface SortColumn {
  expr: Prisma.Sql
  cast: 'text' | 'timestamp' | 'bigint'
}

/**
 * Row-value comparison keeps the (sort, id) tiebreaker correct when many rows share a sort value (e.g. 40 users
 * created in the same millisecond) — without the id tiebreaker rows get skipped or duplicated across pages.
 *
 * `column` comes ONLY from a server-side whitelist map, never from request input.
 */
export function keysetWhere(
  column: SortColumn,
  idColumn: Prisma.Sql, // qualified (e.g. u.id) — an unqualified `id` is ambiguous once the query joins another table
  order: 'asc' | 'desc',
  cursor: Cursor | null,
): Prisma.Sql {
  if (!cursor) return Prisma.sql`TRUE`
  const op = order === 'desc' ? Prisma.raw('<') : Prisma.raw('>')
  const value =
    column.cast === 'timestamp'
      ? Prisma.sql`${String(cursor.v)}::timestamp`
      : column.cast === 'bigint'
        ? Prisma.sql`${String(cursor.v)}::bigint`
        : Prisma.sql`${String(cursor.v)}::text`
  return Prisma.sql`(${column.expr}, ${idColumn}) ${op} (${value}, ${cursor.id})`
}

/**
 * Turn the +1 over-fetched rows into a page. The extra row is a cheap "is there a next page" signal —
 * no COUNT(*) on the hot path.
 */
export function toPage<T extends { id: string; sortValue: unknown }>(rows: T[], limit: number, sortBy: string) {
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const last = items[items.length - 1]

  let nextCursor: string | null = null
  if (hasMore && last) {
    const raw = last.sortValue
    const v = raw instanceof Date ? raw.toISOString() : typeof raw === 'bigint' ? Number(raw) : (raw as string | number)
    nextCursor = encodeCursor({ v, id: last.id, s: sortBy })
  }

  return { items: items.map(({ sortValue: _omit, ...rest }) => rest), nextCursor, hasMore }
}
