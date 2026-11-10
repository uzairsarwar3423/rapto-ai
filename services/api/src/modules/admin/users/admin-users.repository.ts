import { Prisma } from '@prisma/client'
import { prisma } from '../../../db/client'
import { keysetWhere, type Cursor, type SortColumn } from './keyset'

// Whitelists: request input selects a KEY, never an SQL fragment. Nothing from the request reaches an identifier.
const USER_SORT: Record<'createdAt' | 'name' | 'email', SortColumn> = {
  createdAt: { expr: Prisma.sql`u."createdAt"`, cast: 'timestamp' },
  name: { expr: Prisma.sql`lower(u.name)`, cast: 'text' },
  email: { expr: Prisma.sql`lower(u.email)`, cast: 'text' },
}

const TEAM_SORT: Record<'createdAt' | 'name' | 'mrr', SortColumn> = {
  createdAt: { expr: Prisma.sql`t."createdAt"`, cast: 'timestamp' },
  name: { expr: Prisma.sql`lower(t.name)`, cast: 'text' },
  mrr: { expr: Prisma.sql`COALESCE(m.mrr_cents, 0)`, cast: 'bigint' },
}

const dir = (order: 'asc' | 'desc') => (order === 'desc' ? Prisma.raw('DESC') : Prisma.raw('ASC'))
const likePattern = (escaped: string) => `%${escaped}%`

export interface UserRowRaw {
  id: string
  name: string
  email: string
  role: string
  emailVerified: boolean
  createdAt: Date
  teamId: string | null
  teamName: string | null
  planTier: string
  sortValue: Date | string | number | bigint
}

export interface TeamRowRaw {
  id: string
  name: string
  slug: string
  createdAt: Date
  plan: string
  mrrCents: bigint
  membersCount: number
  sortValue: Date | string | number | bigint
}

export const adminUsersRepository = {
  /**
   * INTENTIONALLY not team-scoped: this is the platform-wide, cross-tenant read the admin dashboard exists for.
   * Soft-deleted users are excluded. Users without a team (invited, no team yet) are retained via the LEFT JOIN.
   * Plan comes from the denormalized `teams.plan` entitlement (one row per team — no duplicate-row risk).
   */
  async listUsers(f: {
    search?: string
    role?: string
    planTier?: string
    teamId?: string
    sortBy: keyof typeof USER_SORT
    sortOrder: 'asc' | 'desc'
    limit: number
    cursor: Cursor | null
  }): Promise<UserRowRaw[]> {
    const sort = USER_SORT[f.sortBy]
    const where: Prisma.Sql[] = [Prisma.sql`u."deletedAt" IS NULL`, keysetWhere(sort, Prisma.sql`u.id`, f.sortOrder, f.cursor)]
    if (f.search) {
      const p = likePattern(f.search)
      where.push(Prisma.sql`(lower(u.name) LIKE ${p} ESCAPE '\\' OR lower(u.email) LIKE ${p} ESCAPE '\\')`)
    }
    if (f.role) where.push(Prisma.sql`u.role::text = ${f.role}`)
    if (f.teamId) where.push(Prisma.sql`u."teamId" = ${f.teamId}`)
    if (f.planTier) where.push(Prisma.sql`COALESCE(t.plan::text, 'FREE') = ${f.planTier}`)

    return prisma.$queryRaw<UserRowRaw[]>(Prisma.sql`
      SELECT u.id, u.name, u.email, u.role::text AS role,
             u."emailVerified" AS "emailVerified", u."createdAt" AS "createdAt",
             u."teamId" AS "teamId", t.name AS "teamName",
             COALESCE(t.plan::text, 'FREE') AS "planTier",
             ${sort.expr} AS "sortValue"
      FROM users u
      LEFT JOIN teams t ON t.id = u."teamId"
      WHERE ${Prisma.join(where, ' AND ')}
      ORDER BY ${sort.expr} ${dir(f.sortOrder)}, u.id ${dir(f.sortOrder)}
      LIMIT ${f.limit + 1}`) // +1 row = "is there a next page" signal; no COUNT(*)
  },

  async listTeams(f: {
    search?: string
    plan?: string
    sortBy: keyof typeof TEAM_SORT
    sortOrder: 'asc' | 'desc'
    limit: number
    cursor: Cursor | null
  }): Promise<TeamRowRaw[]> {
    const sort = TEAM_SORT[f.sortBy]
    const where: Prisma.Sql[] = [keysetWhere(sort, Prisma.sql`t.id`, f.sortOrder, f.cursor)]
    if (f.search) {
      where.push(Prisma.sql`lower(t.name) LIKE ${likePattern(f.search)} ESCAPE '\\'`)
    }
    if (f.plan) where.push(Prisma.sql`t.plan::text = ${f.plan}`)

    return prisma.$queryRaw<TeamRowRaw[]>(Prisma.sql`
      WITH team_mrr AS (
        SELECT "teamId" AS team_id,
               SUM(CASE WHEN "billingInterval" = 'year' THEN ROUND(COALESCE("unitAmount", 0) / 12.0)
                        ELSE COALESCE("unitAmount", 0) END)::bigint AS mrr_cents
        FROM subscriptions
        WHERE status::text = 'active'
        GROUP BY "teamId"
      ), team_members AS (
        SELECT "teamId" AS team_id, COUNT(*)::int AS members
        FROM users
        WHERE "deletedAt" IS NULL AND "teamId" IS NOT NULL
        GROUP BY "teamId"
      )
      SELECT t.id, t.name, t.slug, t."createdAt" AS "createdAt",
             t.plan::text AS plan,
             COALESCE(m.mrr_cents, 0)::bigint AS "mrrCents",
             COALESCE(tm.members, 0)::int AS "membersCount",
             ${sort.expr} AS "sortValue"
      FROM teams t
      LEFT JOIN team_mrr m ON m.team_id = t.id
      LEFT JOIN team_members tm ON tm.team_id = t.id
      WHERE ${Prisma.join(where, ' AND ')}
      ORDER BY ${sort.expr} ${dir(f.sortOrder)}, t.id ${dir(f.sortOrder)}
      LIMIT ${f.limit + 1}`)
  },
}
