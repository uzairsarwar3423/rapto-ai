/**
 * Defence in depth for "no secrets in admin responses": the detail repository must only ever SELECT safe columns.
 * Every Prisma call is captured and the select trees are scanned for credential fields.
 */
const calls: Array<{ model: string; method: string; args: unknown }> = []
const record = (model: string, method: string) =>
  jest.fn(async (args: unknown) => {
    calls.push({ model, method, args })
    return method === 'findMany' || method === 'groupBy' ? [] : method === 'count' ? 0 : null
  })

jest.mock('../../../src/db/client', () => ({
  prisma: {
    user: { findFirst: record('user', 'findFirst'), count: record('user', 'count') },
    commitment: { groupBy: record('commitment', 'groupBy') },
    refreshToken: { findMany: record('refreshToken', 'findMany') },
    adminAuditLog: { findMany: record('adminAuditLog', 'findMany') },
    team: { findUnique: record('team', 'findUnique') },
    teamIntegration: { findMany: record('teamIntegration', 'findMany') },
    subscriptionDailySnapshot: { findFirst: record('subscriptionDailySnapshot', 'findFirst') },
    $queryRaw: jest.fn(async () => []),
  },
}))

import { adminUsersDetailRepository as repo } from '../../../src/modules/admin/users/admin-users.detail.repository'

const FORBIDDEN = ['passwordHash', 'totpSecretEnc', 'tokenHash', 'accessTokenEnc', 'refreshTokenEnc', 'scimTokenHash', 'googleId', 'githubId', 'microsoftId', 'metadata']

const selectKeys = (node: unknown, out: string[] = []): string[] => {
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      out.push(k)
      selectKeys(v, out)
    }
  }
  return out
}

describe('detail repository only selects safe columns', () => {
  it('every query uses an explicit select with no credential field', async () => {
    await repo.findUser('u1')
    await repo.recentSessions('u1')
    await repo.findTeam('t1')
    await repo.findTeamOwner('t1')
    await repo.activeIntegrationProviders('t1')

    expect(calls.length).toBeGreaterThanOrEqual(5)
    for (const c of calls) {
      const args = c.args as { select?: unknown; include?: unknown }
      expect(args.include).toBeUndefined() // include would pull every scalar column
      if (c.method !== 'count') expect(args.select).toBeDefined()
      const keys = selectKeys(args.select)
      for (const f of FORBIDDEN) expect(keys).not.toContain(f)
    }
  })

  it('integrations select the provider column ONLY', async () => {
    calls.length = 0
    await repo.activeIntegrationProviders('t1')
    expect((calls[0]!.args as { select: unknown }).select).toEqual({ provider: true })
  })

  it('sessions never select token hashes and exclude expired / revoked tokens', async () => {
    calls.length = 0
    await repo.recentSessions('u1')
    const args = calls[0]!.args as { select: Record<string, boolean>; where: Record<string, unknown>; take: number }
    expect(Object.keys(args.select).sort()).toEqual(['createdAt', 'id', 'ipAddress', 'lastUsedAt', 'userAgent'])
    expect(args.where).toMatchObject({ reuseDetectedAt: null, expiresAt: { gt: expect.any(Date) } })
    expect(args.take).toBe(5)
  })

  it('soft-deleted users are not found', async () => {
    calls.length = 0
    await repo.findUser('u1')
    expect((calls[0]!.args as { where: unknown }).where).toMatchObject({ id: 'u1', deletedAt: null })
  })
})
