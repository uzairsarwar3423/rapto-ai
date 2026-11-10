const detailService = { getUserDetail: jest.fn(), getTeamDetail: jest.fn() }
jest.mock('../../../src/modules/admin/users/admin-users.detail.service', () => {
  const actual = jest.requireActual('../../../src/modules/admin/users/admin-users.detail.service')
  return { ...actual, adminUsersDetailService: detailService }
})
const usersService = { getSummary: jest.fn(), listUsers: jest.fn(), listTeams: jest.fn() }
jest.mock('../../../src/modules/admin/users/admin-users.service', () => ({ adminUsersService: usersService }))
const viewAudit = jest.fn()
jest.mock('../../../src/modules/admin/shared/view-audit', () => ({ auditViewOnce: viewAudit }))
jest.mock('../../../src/config/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))
jest.mock('../../../src/middleware/admin-auth.middleware', () => ({
  adminAuthMiddleware: (req: any, _r: unknown, n: () => void) => { req.adminUser = { id: 'admin1', role: 'READONLY' }; n() },
}))
jest.mock('../../../src/middleware/admin-role.middleware', () => ({ requireAdminRole: () => (_q: unknown, _r: unknown, n: () => void) => n() }))

import express from 'express'
import request from 'supertest'
import { adminUsersRouter } from '../../../src/modules/admin/users/admin-users.routes'
import { errorMiddleware } from '../../../src/middleware/error.middleware'
import { userNotFound } from '../../../src/modules/admin/users/admin-users.detail.service'

const app = express()
app.use('/api/v1/admin/users', adminUsersRouter)
app.use(errorMiddleware)
const base = '/api/v1/admin/users'

beforeEach(() => {
  jest.clearAllMocks()
  usersService.getSummary.mockResolvedValue({ totalUsers: 1 })
  usersService.listUsers.mockResolvedValue({ users: [], nextCursor: null, hasMore: false })
  usersService.listTeams.mockResolvedValue({ teams: [], nextCursor: null, hasMore: false })
  detailService.getUserDetail.mockResolvedValue({ id: 'u1' })
  detailService.getTeamDetail.mockResolvedValue({ id: 't1' })
})

describe('route order (Day 7 param routes must not swallow static paths)', () => {
  it('/summary is still the summary', async () => {
    const res = await request(app).get(`${base}/summary`)
    expect(res.body.data).toEqual({ totalUsers: 1 })
    expect(detailService.getUserDetail).not.toHaveBeenCalled()
  })
  it('/teams is still the teams list', async () => {
    await request(app).get(`${base}/teams`)
    expect(usersService.listTeams).toHaveBeenCalled()
    expect(detailService.getUserDetail).not.toHaveBeenCalled()
  })
  it('/teams/:teamId is the team detail', async () => {
    const res = await request(app).get(`${base}/teams/t1`)
    expect(res.status).toBe(200)
    expect(detailService.getTeamDetail).toHaveBeenCalledWith('t1')
    expect(detailService.getUserDetail).not.toHaveBeenCalled()
  })
  it('/ is still the users list', async () => {
    await request(app).get(base)
    expect(usersService.listUsers).toHaveBeenCalled()
  })
  it('/:userId is the user detail (registered LAST)', async () => {
    const res = await request(app).get(`${base}/u1`)
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ id: 'u1' })
    expect(detailService.getUserDetail).toHaveBeenCalledWith('u1')
  })
})

describe('errors and auditing', () => {
  it('unknown user → 404 with code USER_NOT_FOUND', async () => {
    detailService.getUserDetail.mockRejectedValue(userNotFound())
    const res = await request(app).get(`${base}/ghost`)
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('USER_NOT_FOUND')
  })

  it('a successful view is audited (fire-and-forget) with the admin, action and target', async () => {
    await request(app).get(`${base}/u1`)
    await request(app).get(`${base}/teams/t1`)
    expect(viewAudit).toHaveBeenCalledWith('admin1', 'user.viewed', { type: 'user', id: 'u1' }, expect.anything())
    expect(viewAudit).toHaveBeenCalledWith('admin1', 'team.viewed', { type: 'team', id: 't1' }, expect.anything())
  })

  it('a not-found view is NOT audited (nothing was viewed)', async () => {
    detailService.getUserDetail.mockRejectedValue(userNotFound())
    await request(app).get(`${base}/ghost`)
    expect(viewAudit).not.toHaveBeenCalled()
  })

  it('a failing audit never fails the read', async () => {
    viewAudit.mockRejectedValue(new Error('audit down'))
    const res = await request(app).get(`${base}/u1`)
    expect(res.status).toBe(200)
  })
})
