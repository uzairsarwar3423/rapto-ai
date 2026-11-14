/**
 * Workspace slug generation, availability and creation — against a REAL throwaway Postgres.
 *
 * REAL: Postgres (unique indexes, transactions), teams routes/validators/service/repository, auth middleware.
 * FAKED: redis (in-memory), queues, sockets — nothing external is contacted.
 *
 * Run (from services/api):  npx jest tests/integration/team-slug.db.test.ts --runInBand
 * See tests/support/team-slug-test-env.ts for the throwaway DB setup.
 */
import '../support/team-slug-test-env'
import express from 'express'
import request from 'supertest'

jest.mock('../../src/config/redis', () => ({ redis: require('../support/fake-redis').createFakeRedis() }))
jest.mock('../../src/queues/queue.client', () => ({
  notifyQueue: { add: jest.fn(async () => ({ id: 'x' })) },
  billingWebhookQueue: { add: jest.fn(async () => ({ id: 'x' })) },
}))
jest.mock('../../src/realtime/socket.emitter', () => ({ socketEmitter: { to: () => ({ emit: jest.fn() }) } }))

import { prisma } from '../../src/db/client'
import { teamsRouter } from '../../src/modules/teams/teams.routes'
import { teamsRepository } from '../../src/modules/teams/teams.repository'
import { errorMiddleware } from '../../src/middleware/error.middleware'
import { generateAccessToken } from '../../src/modules/auth/auth.helpers'

jest.setTimeout(60_000)

const app = express()
app.use(express.json())
app.use('/api/v1/teams', teamsRouter)
app.use(errorMiddleware)

let counter = 0
async function makeLoneUser() {
  counter += 1
  return prisma.user.create({
    data: { email: `slug-${Date.now()}-${counter}@rapto.dev`, name: `Slug User ${counter}`, teamId: null, role: 'MEMBER' },
  })
}
const bearer = (u: { id: string; email: string; teamId: string | null; role: any }) => ({
  Authorization: `Bearer ${generateAccessToken({ id: u.id, email: u.email, teamId: u.teamId, role: u.role })}`,
})
const createTeamAs = (u: any, body: { name: string; slug?: string }) =>
  request(app).post('/api/v1/teams').set(bearer(u)).send(body)
const check = (slug: string) => request(app).get('/api/v1/teams/check-slug').query({ slug })
const seedTeam = (slug: string) => prisma.team.create({ data: { name: `Seed ${slug}`, slug } })

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`
})
beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "users","teams" RESTART IDENTITY CASCADE')
  jest.restoreAllMocks()
})
afterAll(async () => {
  await prisma.$disconnect()
})

describe('database constraints', () => {
  it('has a UNIQUE index on slug and a case-insensitive UNIQUE index on lower(slug)', async () => {
    const rows = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'teams' AND indexdef ILIKE '%unique%'`
    const defs = rows.map((r) => r.indexdef.toLowerCase())
    expect(defs.some((d) => d.includes('(slug)'))).toBe(true)
    expect(defs.some((d) => d.includes('lower(slug'))).toBe(true)
  })

  it('rejects an exact duplicate slug', async () => {
    await seedTeam('uzair')
    await expect(seedTeam('uzair')).rejects.toMatchObject({ code: 'P2002' })
  })

  it('rejects a case-only duplicate written by any code path', async () => {
    await seedTeam('uzair')
    await expect(seedTeam('Uzair')).rejects.toMatchObject({ code: 'P2002' })
  })
})

describe('GET /teams/check-slug', () => {
  it('reports a free slug as available', async () => {
    const res = await check('uzair')
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ available: true, slug: 'uzair' })
  })

  it('suggests the next sequential slug when taken: uzair -> uzair-1 -> uzair-2 -> uzair-3', async () => {
    await seedTeam('uzair')
    expect((await check('uzair')).body.data).toMatchObject({ available: false, reason: 'TAKEN', suggestion: 'uzair-1' })

    await seedTeam('uzair-1')
    expect((await check('uzair')).body.data.suggestion).toBe('uzair-2')

    await seedTeam('uzair-2')
    expect((await check('uzair')).body.data.suggestion).toBe('uzair-3')
  })

  it('fills gaps: first free suffix, not max+1', async () => {
    await seedTeam('uzair')
    await seedTeam('uzair-1')
    await seedTeam('uzair-3')
    expect((await check('uzair')).body.data.suggestion).toBe('uzair-2')
  })

  it('normalises input (case, spaces, special characters) before checking', async () => {
    await seedTeam('my-team')
    const res = await check('  MY   Team! ')
    expect(res.body.data).toMatchObject({ slug: 'my-team', available: false, suggestion: 'my-team-1' })
  })

  it('treats reserved slugs like taken ones', async () => {
    const res = await check('admin')
    expect(res.body.data).toMatchObject({ available: false, reason: 'RESERVED', suggestion: 'admin-1' })
  })

  it('answers INVALID with a usable suggestion instead of an error (empty / too short / symbols)', async () => {
    for (const bad of ['', 'a', '!!!', '日本語']) {
      const res = await check(bad)
      expect(res.status).toBe(200)
      expect(res.body.data.available).toBe(false)
      expect(res.body.data.reason).toBe('INVALID')
      expect(res.body.data.suggestion).toMatch(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/)
    }
  })

  it('keeps suggestions within 50 chars even for a 50-char taken slug', async () => {
    const long = 'a'.repeat(50)
    await seedTeam(long)
    const res = await check(long)
    expect(res.body.data.suggestion.length).toBeLessThanOrEqual(50)
    expect(res.body.data.suggestion.endsWith('-1')).toBe(true)
  })
})

describe('POST /teams (create)', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/v1/teams').send({ name: 'Uzair' })
    expect(res.status).toBe(401)
  })

  it('derives the slug from the name and makes the caller OWNER of that team', async () => {
    const user = await makeLoneUser()
    const res = await createTeamAs(user, { name: 'Rapto AI' })
    expect(res.status).toBe(201)
    expect(res.body.data.slug).toBe('rapto-ai')
    expect(res.body.data.slugAdjusted).toBe(false)

    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(dbUser.teamId).toBe(res.body.data.id)
    expect(dbUser.role).toBe('OWNER')
  })

  it('auto-resolves a taken slug instead of failing: uzair -> uzair-1 -> uzair-2', async () => {
    const slugs: string[] = []
    for (let i = 0; i < 3; i++) {
      const res = await createTeamAs(await makeLoneUser(), { name: 'Uzair' })
      expect(res.status).toBe(201)
      slugs.push(res.body.data.slug)
    }
    expect(slugs).toEqual(['uzair', 'uzair-1', 'uzair-2'])
  })

  it('revalidates an explicit slug on the server and flags the adjustment', async () => {
    await seedTeam('acme')
    const res = await createTeamAs(await makeLoneUser(), { name: 'Acme', slug: 'acme' })
    expect(res.status).toBe(201)
    expect(res.body.data.slug).toBe('acme-1')
    expect(res.body.data.slugAdjusted).toBe(true)
  })

  it('normalises an explicit slug with spaces / capitals / specials', async () => {
    const res = await createTeamAs(await makeLoneUser(), { name: 'Whatever', slug: '  My  Team!! ' })
    expect(res.status).toBe(201)
    expect(res.body.data.slug).toBe('my-team')
  })

  it('resolves a reserved slug', async () => {
    const res = await createTeamAs(await makeLoneUser(), { name: 'Admin', slug: 'admin' })
    expect(res.status).toBe(201)
    expect(res.body.data.slug).toBe('admin-1')
  })

  it('falls back to "workspace" when the name has no usable characters', async () => {
    const res = await createTeamAs(await makeLoneUser(), { name: '!!' })
    expect(res.status).toBe(201)
    expect(res.body.data.slug).toBe('workspace')
  })

  it('rejects an empty / too-short name with a validation error (422) and creates nothing', async () => {
    const user = await makeLoneUser()
    expect((await createTeamAs(user, { name: '' })).status).toBe(422)
    expect((await createTeamAs(user, { name: ' ' })).status).toBe(422)
    expect(await prisma.team.count()).toBe(0)
  })

  it('refuses a user who already has a team and creates nothing', async () => {
    const user = await makeLoneUser()
    const first = await createTeamAs(user, { name: 'First Team' })
    expect(first.status).toBe(201)
    const second = await createTeamAs({ ...user, teamId: first.body.data.id, role: 'OWNER' }, { name: 'Second Team' })
    expect(second.status).toBe(403)
    expect(await prisma.team.count()).toBe(1)
  })
})

describe('concurrency', () => {
  it('12 users creating the same workspace name at once all succeed with 12 distinct slugs', async () => {
    const users = await Promise.all(Array.from({ length: 12 }, () => makeLoneUser()))
    const results = await Promise.all(users.map((u) => createTeamAs(u, { name: 'Uzair' })))

    expect(results.map((r) => r.status)).toEqual(Array(12).fill(201))
    const slugs = results.map((r) => r.body.data.slug as string)
    expect(new Set(slugs).size).toBe(12)
    // Under contention, losers spread across free suffixes (a last-resort random suffix is also valid).
    expect(slugs.every((s) => /^uzair(-[a-z0-9]+)?$/.test(s))).toBe(true)
    expect(slugs).toContain('uzair')

    // Database agrees: 12 teams, and each user belongs to exactly the team they were told about.
    expect(await prisma.team.count()).toBe(12)
    for (let i = 0; i < users.length; i++) {
      const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: users[i].id } })
      expect(dbUser.teamId).toBe(results[i].body.data.id)
      expect(dbUser.role).toBe('OWNER')
    }
  })

  it('one user firing 6 create requests at once ends up with exactly one team (no orphans)', async () => {
    const user = await makeLoneUser()
    const results = await Promise.all(Array.from({ length: 6 }, () => createTeamAs(user, { name: 'Solo Team' })))

    const statuses = results.map((r) => r.status).sort()
    expect(statuses.filter((s) => s === 201)).toHaveLength(1)
    expect(statuses.filter((s) => s === 403)).toHaveLength(5)
    expect(await prisma.team.count()).toBe(1) // losing attempts rolled their team back

    const winner = results.find((r) => r.status === 201)!
    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(dbUser.teamId).toBe(winner.body.data.id)
  })

  it('recovers from a lost slug race: stale availability read -> unique violation -> retry with next slug', async () => {
    await seedTeam('uzair')
    // First availability probe returns a stale "nothing exists" answer, exactly as if another
    // request grabbed 'uzair' between our read and our insert.
    const spy = jest.spyOn(teamsRepository, 'findExistingSlugs').mockResolvedValueOnce(new Set())

    const res = await createTeamAs(await makeLoneUser(), { name: 'Uzair' })
    expect(res.status).toBe(201)
    // Retry after a conflict picks among the first two free slugs (spreads concurrent creators apart).
    expect(['uzair-1', 'uzair-2']).toContain(res.body.data.slug)
    expect(res.body.data.slugAdjusted).toBe(true)
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2) // re-resolved after the conflict
    expect(await prisma.team.count()).toBe(2)
  })
})

describe('long names', () => {
  it('truncates to a valid ≤50-char slug and still de-duplicates', async () => {
    const name = 'The Extraordinarily Long Workspace Name That Keeps Going And Going Forever'
    const a = await createTeamAs(await makeLoneUser(), { name })
    const b = await createTeamAs(await makeLoneUser(), { name })
    expect(a.status).toBe(201)
    expect(b.status).toBe(201)
    for (const r of [a, b]) {
      expect(r.body.data.slug.length).toBeLessThanOrEqual(50)
      expect(r.body.data.slug).toMatch(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/)
    }
    expect(a.body.data.slug).not.toBe(b.body.data.slug)
    expect(b.body.data.slug.endsWith('-1')).toBe(true)
  })
})
