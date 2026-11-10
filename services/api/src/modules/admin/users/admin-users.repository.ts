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

export type UserStatus = 'ACTIVE' | 'UNVERIFIED' | 'SUSPENDED'

/**
 * Status is DERIVED, never stored:
 *   an active suspension (user_suspensions.liftedAt IS NULL)  → SUSPENDED
 *   else email not verified                                   → UNVERIFIED
 *   else                                                      → ACTIVE
 * Suspension wins over verification: a suspended user is SUSPENDED whether or not they verified their email.
 */
export const STATUS_EXPR = Prisma.sql`(CASE WHEN sus.id IS NOT NULL THEN 'SUSPENDED'
                                          WHEN NOT u."emailVerified" THEN 'UNVERIFIED'
                                          ELSE 'ACTIVE' END)`

/**
 * The status FILTER is expressed as plain predicates instead of `STATUS_EXPR = $1`, so the planner can use the
 * partial unique index on user_suspensions and the join stays a cheap anti/semi join.
 */
export function statusCondition(status: UserStatus): Prisma.Sql {
  switch (status) {
    case 'SUSPENDED':
      return Prisma.sql`sus.id IS NOT NULL`
    case 'UNVERIFIED':
      return Prisma.sql`(sus.id IS NULL AND NOT u."emailVerified")`
    case 'ACTIVE':
      return Prisma.sql`(sus.id IS NULL AND u."emailVerified")`
  }
}

export interface UserRowRaw {
  id: string
  name: string
  email: string
  role: string
  emailVerified: boolean
  createdAt: Date
  lastActiveAt: Date | null
  teamId: string | null
  teamName: string | null
  planTier: string
  status: UserStatus
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
  ownerName: string | null
  ownerEmail: string | null
  sortValue: Date | string | number | bigint
}

export interface UsersSummaryRaw {
  totalUsers: number
  newUsers7d: number
  unverifiedUsers: number
  suspendedUsers: number
  totalTeams: number
  paidTeams: number
  newTeams7d: number
}

export const adminUsersRepository = {
  /**
   * INTENTIONALLY not team-scoped: this is the platform-wide, cross-tenant read the admin dashboard exists for.
   * Soft-deleted users are excluded. Users without a team (invited, no team yet) are retained via the LEFT JOIN.
   * Plan comes from the denormalized `teams.plan` entitlement (one row per team — no duplicate-row risk).
   * The suspension join is at most one row per user (partial unique index on active suspensions).
   * "Last active" is `users.lastActiveAt` (maintained on login), falling back to `lastLoginAt` — a plain column read,
   * no per-row subquery.
   */
  async listUsers(f: {
    search?: string
    role?: string
    planTier?: string
    teamId?: string
    status?: UserStatus
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
    if (f.status) where.push(statusCondition(f.status))

    return prisma.$queryRaw<UserRowRaw[]>(Prisma.sql`
      SELECT u.id, u.name, u.email, u.role::text AS role,
             u."emailVerified" AS "emailVerified", u."createdAt" AS "createdAt",
             COALESCE(u."lastActiveAt", u."lastLoginAt") AS "lastActiveAt",
             u."teamId" AS "teamId", t.name AS "teamName",
             COALESCE(t.plan::text, 'FREE') AS "planTier",
             ${STATUS_EXPR} AS status,
             ${sort.expr} AS "sortValue"
      FROM users u
      LEFT JOIN teams t ON t.id = u."teamId"
      LEFT JOIN user_suspensions sus ON sus."userId" = u.id AND sus."liftedAt" IS NULL
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

    // The owner lateral join runs once per returned row (after LIMIT is applied by the planner's nested loop), and a
    // team with no owner yields NULLs — never an error.
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
             owner.name AS "ownerName", owner.email AS "ownerEmail",
             ${sort.expr} AS "sortValue"
      FROM teams t
      LEFT JOIN team_mrr m ON m.team_id = t.id
      LEFT JOIN team_members tm ON tm.team_id = t.id
      LEFT JOIN LATERAL (
        SELECT u2.name, u2.email
        FROM users u2
        WHERE u2."teamId" = t.id AND u2.role::text = 'OWNER' AND u2."deletedAt" IS NULL
        ORDER BY u2."createdAt", u2.id
        LIMIT 1
      ) owner ON TRUE
      WHERE ${Prisma.join(where, ' AND ')}
      ORDER BY ${sort.expr} ${dir(f.sortOrder)}, t.id ${dir(f.sortOrder)}
      LIMIT ${f.limit + 1}`)
  },

  /**
   * One round trip, seven scalar subqueries. Counts use the SAME definitions as the lists (soft-deleted users are
   * excluded; "paid" = a team with an active subscription) so the strip can never disagree with the table below it.
   */
  async getSummaryCounts(): Promise<UsersSummaryRaw> {
    const [row] = await prisma.$queryRaw<UsersSummaryRaw[]>`
      SELECT
        (SELECT COUNT(*) FROM users WHERE "deletedAt" IS NULL)::int AS "totalUsers",
        (SELECT COUNT(*) FROM users
           WHERE "deletedAt" IS NULL AND "createdAt" >= (NOW() AT TIME ZONE 'UTC') - INTERVAL '7 days')::int AS "newUsers7d",
        (SELECT COUNT(*) FROM users WHERE "deletedAt" IS NULL AND NOT "emailVerified")::int AS "unverifiedUsers",
        (SELECT COUNT(*) FROM user_suspensions s JOIN users u ON u.id = s."userId"
           WHERE s."liftedAt" IS NULL AND u."deletedAt" IS NULL)::int AS "suspendedUsers",
        (SELECT COUNT(*) FROM teams)::int AS "totalTeams",
        (SELECT COUNT(DISTINCT "teamId") FROM subscriptions WHERE status::text = 'active')::int AS "paidTeams",
        (SELECT COUNT(*) FROM teams WHERE "createdAt" >= (NOW() AT TIME ZONE 'UTC') - INTERVAL '7 days')::int AS "newTeams7d"`
    return row!
  },
}
