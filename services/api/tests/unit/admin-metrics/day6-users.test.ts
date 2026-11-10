const redisMock = { get: jest.fn(), setex: jest.fn() }
jest.mock('../../../src/config/redis', () => ({ redis: redisMock }))
jest.mock('../../../src/config/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))

const summaryRow = { totalUsers: 120, newUsers7d: 9, unverifiedUsers: 14, suspendedUsers: 2, totalTeams: 30, paidTeams: 11, newTeams7d: 3 }
const repoMock = {
  getSummaryCounts: jest.fn(async () => summaryRow),
  listUsers: jest.fn(async () => []),
  listTeams: jest.fn(async () => []),
}
jest.mock('../../../src/modules/admin/users/admin-users.repository', () => {
  const actual = jest.requireActual('../../../src/modules/admin/users/admin-users.repository')
  return { ...actual, adminUsersRepository: repoMock }
})
// Auth is covered elsewhere — here we only care about routing + validation.
jest.mock('../../../src/middleware/admin-auth.middleware', () => ({ adminAuthMiddleware: (_q: unknown, _r: unknown, n: () => void) => n() }))
jest.mock('../../../src/middleware/admin-role.middleware', () => ({ requireAdminRole: () => (_q: unknown, _r: unknown, n: () => void) => n() }))

import express from 'express'
import request from 'supertest'
import { cacheAside } from '../../../src/modules/admin/shared/cache-aside'
import { adminUsersService, USERS_SUMMARY_CACHE_KEY, USERS_SUMMARY_TTL_SECONDS } from '../../../src/modules/admin/users/admin-users.service'
import { statusCondition } from '../../../src/modules/admin/users/admin-users.repository'
import { listUsersSchema } from '../../../src/modules/admin/users/admin-users.validator'
import { adminUsersRouter } from '../../../src/modules/admin/users/admin-users.routes'
import { errorMiddleware } from '../../../src/middleware/error.middleware'

beforeEach(() => {
  jest.clearAllMocks()
  redisMock.get.mockResolvedValue(null)
  redisMock.setex.mockResolvedValue('OK')
})

describe('cacheAside (shared)', () => {
  it('returns the cached value without computing on a hit', async () => {
    redisMock.get.mockResolvedValue(JSON.stringify({ a: 1 }))
    const compute = jest.fn()
    await expect(cacheAside('k', 60, compute)).resolves.toEqual({ a: 1 })
    expect(compute).not.toHaveBeenCalled()
  })
  it('computes on a miss and stores with the TTL', async () => {
    await expect(cacheAside('k', 60, async () => ({ b: 2 }))).resolves.toEqual({ b: 2 })
    expect(redisMock.setex).toHaveBeenCalledWith('k', 60, JSON.stringify({ b: 2 }))
  })
  it('serves from compute when Redis READ throws (outage degrades latency, not availability)', async () => {
    redisMock.get.mockRejectedValue(new Error('down'))
    await expect(cacheAside('k', 60, async () => 7)).resolves.toBe(7)
  })
  it('still returns the value when the cache WRITE throws', async () => {
    redisMock.setex.mockRejectedValue(new Error('readonly'))
    await expect(cacheAside('k', 60, async () => 7)).resolves.toBe(7)
  })
  it('treats a corrupt cached payload as a miss', async () => {
    redisMock.get.mockResolvedValue('{not json')
    await expect(cacheAside('k', 60, async () => 'fresh')).resolves.toBe('fresh')
  })
})

describe('users summary', () => {
  it('uses the cache:admin:users:* key with a 60s TTL — NOT the dashboard prefix the rollup clears', async () => {
    expect(USERS_SUMMARY_CACHE_KEY.startsWith('cache:admin:users:')).toBe(true)
    expect(USERS_SUMMARY_CACHE_KEY.startsWith('cache:admin:dashboard:')).toBe(false)
    await adminUsersService.getSummary()
    expect(redisMock.setex).toHaveBeenCalledWith(USERS_SUMMARY_CACHE_KEY, USERS_SUMMARY_TTL_SECONDS, JSON.stringify(summaryRow))
  })
  it('a second call within the TTL is a cache hit (repository queried once)', async () => {
    let stored: string | null = null
    redisMock.get.mockImplementation(async () => stored)
    redisMock.setex.mockImplementation(async (_k: string, _t: number, v: string) => { stored = v; return 'OK' })
    await adminUsersService.getSummary()
    await expect(adminUsersService.getSummary()).resolves.toEqual(summaryRow)
    expect(repoMock.getSummaryCounts).toHaveBeenCalledTimes(1)
  })
})

describe('status filter', () => {
  it('SUSPENDED = has an active suspension', () => expect(statusCondition('SUSPENDED').sql).toBe('sus.id IS NOT NULL'))
  it('UNVERIFIED = not suspended AND email unverified (suspension wins)', () => {
    const s = statusCondition('UNVERIFIED').sql
    expect(s).toContain('sus.id IS NULL')
    expect(s).toContain('NOT u."emailVerified"')
  })
  it('ACTIVE = not suspended AND verified', () => {
    const s = statusCondition('ACTIVE').sql
    expect(s).toContain('sus.id IS NULL')
    expect(s).toContain('u."emailVerified"')
    expect(s).not.toContain('NOT u."emailVerified"')
  })
  it('validator accepts only the three statuses', () => {
    expect(listUsersSchema.safeParse({ status: 'SUSPENDED' }).success).toBe(true)
    expect(listUsersSchema.safeParse({ status: 'BANNED' }).success).toBe(false)
  })
})

describe('route order', () => {
  const app = express()
  app.use('/api/v1/admin/users', adminUsersRouter)
  app.use(errorMiddleware)

  it('/summary is served by the summary handler (not swallowed by a param route)', async () => {
    const res = await request(app).get('/api/v1/admin/users/summary')
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual(summaryRow)
  })
  it('/teams is served by the teams handler', async () => {
    const res = await request(app).get('/api/v1/admin/users/teams')
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty('teams')
    expect(repoMock.listTeams).toHaveBeenCalled()
  })
  it('/ is the users list and forwards a valid status filter', async () => {
    const res = await request(app).get('/api/v1/admin/users?status=SUSPENDED&limit=5')
    expect(res.status).toBe(200)
    expect(repoMock.listUsers).toHaveBeenCalledWith(expect.objectContaining({ status: 'SUSPENDED', limit: 5 }))
  })
  it('rejects an invalid status with a 4xx instead of reaching SQL', async () => {
    const res = await request(app).get('/api/v1/admin/users?status=BANNED')
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    expect(repoMock.listUsers).not.toHaveBeenCalled()
  })
})
