import { Prisma } from '@prisma/client'
import { encodeCursor, decodeCursor, keysetWhere, toPage, type SortColumn } from '../../../src/modules/admin/users/keyset'
import { listUsersSchema, listTeamsSchema, escapeLike } from '../../../src/modules/admin/users/admin-users.validator'

describe('cursor encode/decode', () => {
  it('round-trips', () => {
    const c = { v: '2026-11-10T00:00:00.000Z', id: 'u_1', s: 'createdAt' }
    expect(decodeCursor(encodeCursor(c), 'createdAt')).toEqual(c)
  })
  it.each([undefined, '', 'not-base64!!', Buffer.from('{"v":1}').toString('base64url'), Buffer.from('null').toString('base64url')])(
    'malformed cursor %p → null (first page, never a 500)',
    (raw) => expect(decodeCursor(raw as string | undefined, 'createdAt')).toBeNull(),
  )
  it('rejects a cursor minted for a different sort (would otherwise be misread)', () => {
    const c = encodeCursor({ v: 'alice', id: 'u_1', s: 'name' })
    expect(decodeCursor(c, 'createdAt')).toBeNull()
  })
  it('rejects non-finite numeric values', () => {
    const raw = Buffer.from(JSON.stringify({ v: null, id: 'x', s: 'mrr' })).toString('base64url')
    expect(decodeCursor(raw, 'mrr')).toBeNull()
  })
})

describe('keysetWhere', () => {
  const col: SortColumn = { expr: Prisma.sql`u."createdAt"`, cast: 'timestamp' }
  const id = Prisma.sql`u.id`

  it('is TRUE on the first page', () => expect(keysetWhere(col, id, 'desc', null).sql).toBe('TRUE'))

  it('uses a row-value (sort, id) comparison with a QUALIFIED id (no ambiguity across joins)', () => {
    const w = keysetWhere(col, id, 'desc', { v: '2026-11-10T00:00:00.000Z', id: 'u_9', s: 'createdAt' })
    expect(w.sql).toContain('(u."createdAt", u.id) <')
    expect(w.sql).toContain('::timestamp')
    expect(w.values).toEqual(['2026-11-10T00:00:00.000Z', 'u_9'])
  })

  it('flips the operator for ascending order', () => {
    const w = keysetWhere(col, id, 'asc', { v: 'x', id: 'y', s: 'createdAt' })
    expect(w.sql).toContain(') >')
  })

  it('passes cursor values as bound parameters, never concatenated into SQL (injection-safe)', () => {
    const evil = "'; DROP TABLE users; --"
    const w = keysetWhere({ expr: Prisma.sql`lower(u.name)`, cast: 'text' }, id, 'asc', { v: evil, id: evil, s: 'name' })
    expect(w.sql).not.toContain('DROP TABLE')
    expect(w.values).toContain(evil)
  })
})

describe('toPage', () => {
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `id${i}`, sortValue: new Date(Date.UTC(2026, 10, 10, 0, 0, n - i)), name: `n${i}` }))

  it('returns hasMore + a cursor when the +1 sentinel row is present, and strips sortValue', () => {
    const page = toPage(rows(4), 3, 'createdAt')
    expect(page.items).toHaveLength(3)
    expect(page.hasMore).toBe(true)
    expect(page.items[0]).not.toHaveProperty('sortValue')
    const c = decodeCursor(page.nextCursor!, 'createdAt')!
    expect(c.id).toBe('id2') // cursor points at the LAST returned row
  })

  it('has no cursor on the final page', () => {
    const page = toPage(rows(3), 3, 'createdAt')
    expect(page).toMatchObject({ hasMore: false, nextCursor: null })
  })

  it('serializes bigint sort values (mrr) as numbers', () => {
    const page = toPage([{ id: 'a', sortValue: 5000n }, { id: 'b', sortValue: 4000n }], 1, 'mrr')
    expect(decodeCursor(page.nextCursor!, 'mrr')!.v).toBe(5000)
  })

  it('walks 60 rows with IDENTICAL sort values across 3 pages with no dup/skip (tiebreaker contract)', () => {
    // Simulates what Postgres returns for ORDER BY (sort, id) when all sort values tie.
    const all = Array.from({ length: 60 }, (_, i) => ({ id: `u${String(i).padStart(3, '0')}`, sortValue: 'same' })).sort((a, b) =>
      b.id.localeCompare(a.id),
    )
    const seen: string[] = []
    let cursor: ReturnType<typeof decodeCursor> = null
    for (let guard = 0; guard < 10; guard++) {
      const startAfter = cursor ? all.findIndex((r) => r.id === cursor!.id) + 1 : 0 // what (sort,id) < (v,id) selects
      const page = toPage(all.slice(startAfter, startAfter + 26), 25, 'name')
      seen.push(...page.items.map((r) => r.id))
      if (!page.hasMore) break
      cursor = decodeCursor(page.nextCursor!, 'name')
    }
    expect(seen).toHaveLength(60)
    expect(new Set(seen).size).toBe(60)
  })
})

describe('list validators', () => {
  it('applies defaults', () => {
    expect(listUsersSchema.parse({})).toMatchObject({ sortBy: 'createdAt', sortOrder: 'desc', limit: 25 })
  })
  it('caps limit at 100', () => expect(listUsersSchema.safeParse({ limit: '101' }).success).toBe(false))
  it('rejects non-whitelisted sort columns (no request string can reach a SQL identifier)', () => {
    expect(listUsersSchema.safeParse({ sortBy: 'password' }).success).toBe(false)
    expect(listTeamsSchema.safeParse({ sortBy: 'email' }).success).toBe(false)
    expect(listTeamsSchema.safeParse({ sortBy: 'mrr' }).success).toBe(true)
  })
  it('treats % _ \\ as literals and lowercases', () => {
    expect(listUsersSchema.parse({ search: '  50%_Off\\ ' }).search).toBe('50\\%\\_off\\\\')
    expect(escapeLike('a%b_c')).toBe('a\\%b\\_c')
  })
  it('turns blank search into undefined', () => expect(listUsersSchema.parse({ search: '   ' }).search).toBeUndefined())
  it('rejects unknown roles and plans', () => {
    expect(listUsersSchema.safeParse({ role: 'ROOT' }).success).toBe(false)
    expect(listTeamsSchema.safeParse({ plan: 'GOLD' }).success).toBe(false)
  })
})
