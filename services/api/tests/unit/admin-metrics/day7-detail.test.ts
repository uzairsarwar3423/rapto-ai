const repoMock = {
  findUser: jest.fn(),
  commitmentCountsByStatus: jest.fn(),
  recentSessions: jest.fn(),
  staffActivity: jest.fn(),
  findTeam: jest.fn(),
  findTeamOwner: jest.fn(),
  countTeamMembers: jest.fn(),
  activeIntegrationProviders: jest.fn(),
  monthlyMrrSnapshots: jest.fn(),
  firstLiveSnapshotDate: jest.fn(),
}
jest.mock('../../../src/modules/admin/users/admin-users.detail.repository', () => ({ adminUsersDetailRepository: repoMock }))
const healthMock = jest.fn()
jest.mock('../../../src/modules/teams/team-health.service', () => ({ teamHealthService: { calculateTeamHealthScore: healthMock } }))
jest.mock('../../../src/config/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))
const redisMock = { set: jest.fn() }
jest.mock('../../../src/config/redis', () => ({ redis: redisMock }))
const auditWrite = jest.fn()
jest.mock('../../../src/modules/admin/audit/audit-log.service', () => ({ auditLogService: { write: auditWrite } }))
jest.mock('../../../src/config/plans.config', () => ({
  PLAN_LIMITS: {
    FREE: { meetings: 5, members: 3 },
    GROWTH: { meetings: 120, members: 25 },
    ENTERPRISE: { meetings: -1, members: -1 },
  },
}))

import {
  adminUsersDetailService as service,
  deriveUserStatus,
  shapeMrrHistory,
  subscriptionMrrCents,
} from '../../../src/modules/admin/users/admin-users.detail.service'
import { auditViewOnce } from '../../../src/modules/admin/shared/view-audit'
import { isolate } from '../../../src/modules/admin/shared/isolate'

const baseUser = {
  id: 'u1', name: 'Ayesha Khan', email: 'ayesha@acme.io', role: 'OWNER', emailVerified: true,
  createdAt: new Date('2026-01-05T10:00:00Z'), lastActiveAt: new Date('2026-11-10T09:00:00Z'), lastLoginAt: null,
  timezone: 'Asia/Karachi', avatarUrl: null, commitmentScore: 82,
  team: { id: 't1', name: 'Acme', slug: 'acme', plan: 'GROWTH' }, suspensions: [] as any[],
}
const baseTeam = {
  id: 't1', name: 'Acme', slug: 'acme', createdAt: new Date('2026-01-01T00:00:00Z'), plan: 'GROWTH', meetingsUsed: 40,
  subscription: { id: 's1', status: 'active', billingInterval: 'year', unitAmount: 120000, currentPeriodEnd: new Date('2027-01-01T00:00:00Z'), cancelAtPeriodEnd: false },
}

beforeEach(() => {
  jest.clearAllMocks()
  repoMock.findUser.mockResolvedValue(baseUser)
  repoMock.commitmentCountsByStatus.mockResolvedValue([
    { status: 'FULFILLED', _count: { _all: 7 } }, { status: 'MISSED', _count: { _all: 2 } },
    { status: 'PENDING', _count: { _all: 3 } }, { status: 'CANCELLED', _count: { _all: 1 } },
  ])
  repoMock.recentSessions.mockResolvedValue([
    { id: 'rt1', ipAddress: '203.0.113.9', userAgent: 'Mozilla/5.0', lastUsedAt: new Date('2026-11-10T08:00:00Z'), createdAt: new Date('2026-11-01T08:00:00Z') },
  ])
  repoMock.staffActivity.mockResolvedValue([
    { id: 'a1', action: 'user.suspended', metadata: { reason: 'Spam' }, createdAt: new Date('2026-11-09T00:00:00Z'), adminUser: { name: 'Admin One' } },
    { id: 'a2', action: 'user.viewed', metadata: {}, createdAt: new Date('2026-11-08T00:00:00Z'), adminUser: null },
  ])
  repoMock.findTeam.mockResolvedValue(baseTeam)
  repoMock.findTeamOwner.mockResolvedValue({ id: 'u1', name: 'Ayesha Khan', email: 'ayesha@acme.io' })
  repoMock.countTeamMembers.mockResolvedValue(6)
  repoMock.activeIntegrationProviders.mockResolvedValue(['JIRA', 'SLACK'])
  repoMock.monthlyMrrSnapshots.mockResolvedValue([])
  repoMock.firstLiveSnapshotDate.mockResolvedValue(null)
  healthMock.mockResolvedValue({ score: 74, trend: 'improving', fulfillmentRate: 80, avgMemberScore: 70, onTimeRate: 60, computedAt: new Date(), basedOnDays: 30 })
  redisMock.set.mockResolvedValue('OK')
})

describe('user detail', () => {
  it('returns the documented shape', async () => {
    const d = await service.getUserDetail('u1')
    expect(d).toMatchObject({
      id: 'u1', status: 'ACTIVE', suspension: null, commitmentScore: 82, timezone: 'Asia/Karachi',
      team: { id: 't1', plan: 'GROWTH' },
      stats: { commitmentsTotal: 13, fulfilled: 7, missed: 2, pending: 3 },
    })
    expect(d.staffActivity[0]).toEqual({ id: 'a1', action: 'user.suspended', actorName: 'Admin One', reason: 'Spam', createdAt: '2026-11-09T00:00:00.000Z' })
    expect(d.staffActivity[1]).toMatchObject({ actorName: null, reason: null })
  })

  it('unknown id → 404 USER_NOT_FOUND', async () => {
    repoMock.findUser.mockResolvedValue(null)
    await expect(service.getUserDetail('nope')).rejects.toMatchObject({ code: 'USER_NOT_FOUND', statusCode: 404 })
  })

  it.each(['../etc/passwd', 'a'.repeat(200), 'id with space', "x'; DROP TABLE users;--", ''])(
    'malformed id %j → 404 (never 500) and never touches the database',
    async (id) => {
      await expect(service.getUserDetail(id)).rejects.toMatchObject({ code: 'USER_NOT_FOUND', statusCode: 404 })
      expect(repoMock.findUser).not.toHaveBeenCalled()
    },
  )

  it('an active suspension makes the user SUSPENDED and exposes who/why', async () => {
    repoMock.findUser.mockResolvedValue({
      ...baseUser, emailVerified: false,
      suspensions: [{ reason: 'Abuse', suspendedAt: new Date('2026-11-01T00:00:00Z'), suspender: { name: 'Admin One' } }],
    })
    const d = await service.getUserDetail('u1')
    expect(d.status).toBe('SUSPENDED') // suspension wins over "unverified"
    expect(d.suspension).toEqual({ reason: 'Abuse', suspendedAt: '2026-11-01T00:00:00.000Z', suspendedByName: 'Admin One' })
  })

  it('NEVER contains secrets: serialized payload is scanned for credential fields', async () => {
    // Even if a careless repository change leaked these, they must not survive the explicit mapping.
    repoMock.findUser.mockResolvedValue({ ...baseUser, passwordHash: 'hash', totpSecretEnc: 'enc' })
    repoMock.recentSessions.mockResolvedValue([{ id: 'rt1', ipAddress: null, userAgent: null, lastUsedAt: null, createdAt: new Date(), tokenHash: 'th' }])
    const json = JSON.stringify(await service.getUserDetail('u1')).toLowerCase()
    for (const forbidden of ['passwordhash', 'password_hash', 'totpsecret', 'totp_secret', 'tokenhash', 'token_hash', '"hash"', 'enc"']) {
      expect(json).not.toContain(forbidden)
    }
    expect(json).not.toContain('"hash"')
  })

  it('a failing secondary section degrades to empty instead of failing the whole request', async () => {
    repoMock.recentSessions.mockRejectedValue(new Error('db hiccup'))
    const d = await service.getUserDetail('u1')
    expect(d.sessions).toEqual([])
    expect(d.id).toBe('u1')
  })

  it('status derivation matches the list endpoint (suspension > unverified > active)', () => {
    expect(deriveUserStatus(true, true)).toBe('SUSPENDED')
    expect(deriveUserStatus(true, false)).toBe('SUSPENDED')
    expect(deriveUserStatus(false, false)).toBe('UNVERIFIED')
    expect(deriveUserStatus(false, true)).toBe('ACTIVE')
  })
})

describe('team detail', () => {
  it('returns the documented shape, with plan-based limits and MRR contribution', async () => {
    const d = await service.getTeamDetail('t1')
    expect(d).toMatchObject({
      id: 't1', plan: 'GROWTH', owner: { id: 'u1' },
      seats: { used: 6, limit: 25 }, usage: { meetingsUsed: 40, meetingLimit: 120 },
      health: { score: 74, trend: 'improving' },
      subscription: { status: 'active', interval: 'year', amountCents: 120000, mrrCents: 10000, cancelAtPeriodEnd: false },
    })
  })

  it('unknown id → 404 TEAM_NOT_FOUND; malformed id → 404 without a DB call', async () => {
    repoMock.findTeam.mockResolvedValue(null)
    await expect(service.getTeamDetail('nope')).rejects.toMatchObject({ code: 'TEAM_NOT_FOUND', statusCode: 404 })
    repoMock.findTeam.mockClear()
    await expect(service.getTeamDetail('bad id!')).rejects.toMatchObject({ code: 'TEAM_NOT_FOUND', statusCode: 404 })
    expect(repoMock.findTeam).not.toHaveBeenCalled()
  })

  it('health service THROWS → health:null and the rest of the payload is intact', async () => {
    healthMock.mockRejectedValue(new Error('health exploded'))
    const d = await service.getTeamDetail('t1')
    expect(d.health).toBeNull()
    expect(d).toMatchObject({ id: 't1', integrations: ['JIRA', 'SLACK'], seats: { used: 6 } })
  })

  it('health service HANGS → times out to null instead of hanging the drawer', async () => {
    jest.useFakeTimers()
    healthMock.mockReturnValue(new Promise(() => undefined))
    const p = service.getTeamDetail('t1')
    await jest.advanceTimersByTimeAsync(2_000)
    const d = await p
    jest.useRealTimers()
    expect(d.health).toBeNull()
    expect(d.id).toBe('t1')
  })

  it('integrations is an array of provider-name strings only', async () => {
    const d = await service.getTeamDetail('t1')
    expect(Array.isArray(d.integrations)).toBe(true)
    expect(d.integrations.every((i) => typeof i === 'string')).toBe(true)
  })

  it('unlimited plans (-1) are null limits, not -1', async () => {
    repoMock.findTeam.mockResolvedValue({ ...baseTeam, plan: 'ENTERPRISE' })
    const d = await service.getTeamDetail('t1')
    expect(d.seats.limit).toBeNull()
    expect(d.usage.meetingLimit).toBeNull()
  })

  it('a team without a subscription has subscription:null and no crash', async () => {
    repoMock.findTeam.mockResolvedValue({ ...baseTeam, plan: 'FREE', subscription: null })
    const d = await service.getTeamDetail('t1')
    expect(d.subscription).toBeNull()
    expect(d.seats.limit).toBe(3)
  })

  it('a team with no owner returns owner:null', async () => {
    repoMock.findTeamOwner.mockResolvedValue(null)
    expect((await service.getTeamDetail('t1')).owner).toBeNull()
  })
})

describe('subscriptionMrrCents', () => {
  it('annual active plans contribute amount/12', () => expect(subscriptionMrrCents('active', 120000, 'year')).toBe(10000))
  it('monthly active plans contribute the amount', () => expect(subscriptionMrrCents('active', 4900, 'month')).toBe(4900))
  it.each(['trialing', 'past_due', 'cancelled', 'paused'])('%s contributes 0', (s) => expect(subscriptionMrrCents(s, 4900, 'month')).toBe(0))
})

describe('shapeMrrHistory', () => {
  const m = (month: string, mrr: number) => ({ monthStart: new Date(`${month}-01T00:00:00Z`), mrrCents: mrr })

  it('a team that cancelled mid-year shows 0 after the cancellation month (not carried forward)', () => {
    // The SQL maps non-active snapshots to 0; the shaper must preserve those zeros in order.
    const { points } = shapeMrrHistory([m('2026-09', 0), m('2026-07', 4900), m('2026-08', 4900), m('2026-10', 0)], null)
    expect(points.map((p) => p.mrrCents)).toEqual([4900, 4900, 0, 0])
    expect(points.map((p) => p.date)).toEqual(['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'])
  })

  it('keeps at most 12 points (the most recent)', () => {
    const rows = Array.from({ length: 15 }, (_, i) => m(`2025-${String((i % 12) + 1).padStart(2, '0')}`, i)).map((r, i) => ({ ...r, monthStart: new Date(Date.UTC(2025, i, 1)) }))
    expect(shapeMrrHistory(rows, null).points).toHaveLength(12)
  })

  it('flags reconstructed history when a month predates the first LIVE snapshot', () => {
    const r = shapeMrrHistory([m('2026-08', 100), m('2026-11', 200)], new Date('2026-11-10T00:00:00Z'))
    expect(r.reconstructedBefore).toBe('2026-11-10')
  })

  it('no footnote when every month is on/after the first LIVE snapshot', () => {
    expect(shapeMrrHistory([m('2026-11', 200)], new Date('2026-11-01T00:00:00Z')).reconstructedBefore).toBeNull()
  })

  it('no footnote and no points for an empty history', () => {
    expect(shapeMrrHistory([], null)).toEqual({ points: [], reconstructedBefore: null })
  })
})

describe('auditViewOnce (dedupe, decision D8)', () => {
  it('opening the same user 5 times in a minute → exactly ONE audit row', async () => {
    let first = true
    redisMock.set.mockImplementation(async () => (first ? ((first = false), 'OK') : null)) // SET NX semantics
    for (let i = 0; i < 5; i++) await auditViewOnce('admin1', 'user.viewed', { type: 'user', id: 'u1' }, '10.0.0.1')
    expect(auditWrite).toHaveBeenCalledTimes(1)
    expect(auditWrite).toHaveBeenCalledWith('admin1', 'user.viewed', {}, '10.0.0.1', { type: 'user', id: 'u1' })
  })

  it('uses SET NX with a 10 minute expiry, keyed per admin + action + target', async () => {
    await auditViewOnce('admin1', 'team.viewed', { type: 'team', id: 't9' })
    expect(redisMock.set).toHaveBeenCalledWith('audit:view:admin1:team.viewed:t9', '1', 'EX', 600, 'NX')
  })

  it('a different admin or target is audited independently', async () => {
    await auditViewOnce('admin1', 'user.viewed', { type: 'user', id: 'u1' })
    await auditViewOnce('admin2', 'user.viewed', { type: 'user', id: 'u1' })
    await auditViewOnce('admin1', 'user.viewed', { type: 'user', id: 'u2' })
    expect(auditWrite).toHaveBeenCalledTimes(3)
  })

  it('Redis failure → the write is skipped silently and NEVER throws (a read is never blocked)', async () => {
    redisMock.set.mockRejectedValue(new Error('redis down'))
    await expect(auditViewOnce('admin1', 'user.viewed', { type: 'user', id: 'u1' })).resolves.toBeUndefined()
    expect(auditWrite).not.toHaveBeenCalled()
  })
})

describe('isolate', () => {
  it('returns the value on success', async () => expect(await isolate('x', async () => 5, 0)).toBe(5))
  it('returns the fallback on error', async () => expect(await isolate('x', async () => { throw new Error('boom') }, 'fb')).toBe('fb'))
})
