// ─────────────────────────────────────────────────────────────────────────────
// onboarding-latency.test.ts — I/O round-trip budget for the onboarding endpoints.
//
// Every Prisma / Redis / BullMQ call is replaced by an in-memory stand-in that
// sleeps RTT_MS and is counted. That makes the cost of an endpoint measurable
// without a database: `trips` is the number of I/O calls, `serial` is the
// number of RTTs on the critical path (wall time / RTT_MS).
//
// It covers the requests the onboarding flow makes:
//   POST  /teams            → teamsService.createTeam
//   POST  /teams/me/invite  → teamsService.inviteMembers
//   PATCH /auth/me          → authService.updateMe   (onboarding completion)
//   POST  /auth/refresh     → authService.refresh    (session bootstrap on reload)
// ─────────────────────────────────────────────────────────────────────────────
import '../support/team-slug-test-env'

const RTT_MS = Number(process.env.ONBOARDING_RTT_MS ?? 10)

// ── Instrumented I/O ──────────────────────────────────────────────────────────
const io = { trips: 0, log: [] as string[] }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function trip<T>(label: string, value: () => T): Promise<T> {
  io.trips++
  io.log.push(label)
  await sleep(RTT_MS)
  return value()
}

type Handler = (args: any) => any
const handlers: Record<string, Handler> = {}
const defaults: Record<string, Handler> = {
  findMany: () => [],
  findFirst: () => null,
  findUnique: () => null,
  count: () => 0,
  create: (a) => ({ id: `id_${io.trips}`, ...(a?.data ?? {}) }),
  createMany: (a) => ({ count: a?.data?.length ?? 0 }),
  update: (a) => ({ id: a?.where?.id, ...(a?.data ?? {}) }),
  updateMany: () => ({ count: 1 }),
  upsert: () => ({}),
  delete: () => ({}),
  deleteMany: () => ({ count: 0 }),
}
const modelProxy = (model: string) =>
  new Proxy(
    {},
    {
      get: (_t, method: string) => (args: any) =>
        trip(`${model}.${method}`, () => (handlers[`${model}.${method}`] ?? defaults[method] ?? (() => null))(args)),
    }
  )
const prismaMock: any = new Proxy(
  {},
  {
    get: (_t, key: string) => {
      if (key === '$transaction') {
        return async (arg: any) => (typeof arg === 'function' ? arg(prismaMock) : Promise.all(arg))
      }
      return modelProxy(key)
    },
  }
)

jest.mock('../../src/db/client', () => ({ prisma: prismaMock }))
jest.mock('../../src/config/redis', () => {
  const fake = require('../support/fake-redis').createFakeRedis()
  return {
    redis: new Proxy(fake, {
      get: (t, k: string) =>
        typeof t[k] === 'function' ? (...a: any[]) => trip(`redis.${k}`, () => t[k](...a)).then((p) => p) : t[k],
    }),
  }
})
const queueAdd = jest.fn((name: string) => trip(`queue.add:${name}`, () => ({ id: 'job' })))
jest.mock('../../src/queues/queue.client', () => ({
  notifyQueue: { add: (...a: any[]) => queueAdd(...(a as [string])) },
  billingWebhookQueue: { add: jest.fn() },
}))
const sentEmails: string[] = []
jest.mock('../../src/modules/notifications/email.service', () => ({
  emailService: new Proxy(
    {},
    { get: (_t, k: string) => async (p: any) => void sentEmails.push(`${k}:${p?.to}`) }
  ),
}))
jest.mock('../../src/modules/billing/entitlement.service', () => ({
  getTeamEntitlement: () => trip('entitlement', () => ({ plan: 'ENTERPRISE', validUntil: null })),
}))
jest.mock('../../src/realtime/socket.emitter', () => ({ socketEmitter: { to: () => ({ emit: jest.fn() }) } }))

import { teamsService } from '../../src/modules/teams/teams.service'
import { authService } from '../../src/modules/auth/auth.service'
import { hashToken } from '../../src/modules/auth/auth.helpers'

async function measure(fn: () => Promise<unknown>) {
  io.trips = 0
  io.log = []
  const t0 = performance.now()
  const result = await fn()
  const ms = performance.now() - t0
  return { result: result as any, trips: io.trips, ms: Math.round(ms), serial: Math.round(ms / RTT_MS), log: [...io.log] }
}

const report: Record<string, { trips: number; serial: number; ms: number }> = {}
afterAll(() => {
  // eslint-disable-next-line no-console
  console.log(`I/O budget @ ${RTT_MS}ms RTT\n` + JSON.stringify(report, null, 2))
})

const TEAM = {
  id: 'team_1',
  name: 'Acme',
  slug: 'acme',
  plan: 'FREE',
  settings: {},
  members: [{ id: 'u_owner', role: 'OWNER' }],
  _count: { meetings: 0 },
}

beforeEach(() => {
  for (const k of Object.keys(handlers)) delete handlers[k]
  sentEmails.length = 0
  queueAdd.mockClear()
})

describe('POST /teams/me/invite — inviteMembers', () => {
  const emails = ['a@x.dev', 'b@x.dev', 'c@x.dev', 'd@x.dev', 'e@x.dev']

  beforeEach(() => {
    handlers['team.findUnique'] = () => TEAM
    handlers['user.findUnique'] = () => ({ name: 'Owner', email: 'owner@x.dev' })
    // b is already a member, c already has a pending invite (gets re-sent)
    handlers['user.findFirst'] = (a) => (a.where.email === 'b@x.dev' ? { id: 'u_b' } : null)
    handlers['user.findMany'] = (a) =>
      (a.where.email?.in ?? []).includes('b@x.dev') ? [{ id: 'u_b', email: 'b@x.dev' }] : []
    handlers['teamInvitation.findFirst'] = (a) => (a.where.invitedEmail === 'c@x.dev' ? { id: 'inv_c' } : null)
    handlers['teamInvitation.findMany'] = (a) =>
      (a.where.invitedEmail?.in ?? []).includes('c@x.dev') ? [{ id: 'inv_c', invitedEmail: 'c@x.dev' }] : []
  })

  it('classifies every email and returns the same result shape', async () => {
    const m = await measure(() => teamsService.inviteMembers('team_1', 'u_owner', { emails, role: 'MEMBER' } as any))
    report['inviteMembers(5 emails)'] = { trips: m.trips, serial: m.serial, ms: m.ms }

    expect(m.result.alreadyMember).toEqual(['b@x.dev'])
    expect(m.result.invited.sort()).toEqual(['a@x.dev', 'c@x.dev', 'd@x.dev', 'e@x.dev'])
    expect(m.result.failed).toEqual([])
    expect(Object.keys(m.result.inviteLinks).sort()).toEqual(['a@x.dev', 'c@x.dev', 'd@x.dev', 'e@x.dev'])
    // every invited address gets exactly one direct email + one queued job
    expect(sentEmails.filter((e) => e.startsWith('sendTeamInviteEmail')).length).toBe(4)
    expect(queueAdd).toHaveBeenCalledTimes(4)
    // the stale pending invite for c is replaced
    expect(m.log).toEqual(expect.arrayContaining(['teamInvitation.delete']))
  })

  it('isolates a per-email failure without failing the batch', async () => {
    handlers['teamInvitation.create'] = (a) => {
      if (a.data.invitedEmail === 'd@x.dev') throw new Error('boom')
      return { id: 'inv' }
    }
    const m = await measure(() => teamsService.inviteMembers('team_1', 'u_owner', { emails, role: 'MEMBER' } as any))
    expect(m.result.failed).toEqual(['d@x.dev'])
    expect(m.result.invited.sort()).toEqual(['a@x.dev', 'c@x.dev', 'e@x.dev'])
  })
})

describe('POST /teams — createTeam', () => {
  it('creates the team and signs a fresh token carrying the new teamId', async () => {
    handlers['user.findUnique'] = (a) =>
      a.select?.role
        ? { id: 'u1', email: 'u1@x.dev', teamId: 'team_new', role: 'OWNER' }
        : { id: 'u1', email: 'u1@x.dev', teamId: null }
    handlers['team.create'] = (a) => ({ id: 'team_new', name: a.data.name, slug: a.data.slug, plan: 'FREE', createdAt: new Date() })
    const m = await measure(() => teamsService.createTeam('u1', { name: 'Acme', slug: 'acme' } as any))
    report['createTeam'] = { trips: m.trips, serial: m.serial, ms: m.ms }

    expect(m.result.slug).toBe('acme')
    const claims = JSON.parse(Buffer.from(m.result.accessToken.split('.')[1], 'base64url').toString())
    expect(claims).toMatchObject({ sub: 'u1', teamId: 'team_new', role: 'OWNER', email: 'u1@x.dev' })
  })
})

describe('PATCH /auth/me — onboarding completion', () => {
  let completed = false
  beforeEach(() => {
    completed = false
    handlers['user.findUnique'] = () => ({ onboardingCompleted: completed })
    handlers['user.updateMany'] = (a) => {
      if (a.where.onboardingCompleted === false && !completed) {
        completed = true
        return { count: 1 }
      }
      return { count: 0 }
    }
    handlers['user.update'] = (a) => {
      if (a.data?.onboardingCompleted) completed = true
      return {
        id: 'u1', name: 'U', email: 'u1@x.dev', role: 'OWNER', teamId: 'team_1',
        avatarUrl: null, timezone: 'UTC', lastLoginAt: null, onboardingCompleted: completed,
        team: { ...TEAM, scimTokenHash: 'secret', stripeCustomerId: 'cus_1' },
      }
    }
  })

  it('sends the welcome email once, even when completion is submitted twice', async () => {
    const m = await measure(() => authService.updateMe('u1', { onboardingCompleted: true }))
    report['updateMe(onboardingCompleted)'] = { trips: m.trips, serial: m.serial, ms: m.ms }
    await authService.updateMe('u1', { onboardingCompleted: true })

    expect(m.result.user.onboardingCompleted).toBe(true)
    expect(sentEmails.filter((e) => e.startsWith('sendOwnerWelcomeEmail'))).toEqual(['sendOwnerWelcomeEmail:u1@x.dev'])
  })

  it('never exposes billing / SSO internals of the team', async () => {
    const { user } = await authService.updateMe('u1', { onboardingCompleted: true })
    expect(user.team).toEqual({ id: 'team_1', name: 'Acme', slug: 'acme', plan: 'FREE' })
  })

  it('plain profile updates do not pre-read the user', async () => {
    const m = await measure(() => authService.updateMe('u1', { name: 'New' }))
    report['updateMe(name)'] = { trips: m.trips, serial: m.serial, ms: m.ms }
    expect(m.trips).toBe(1)
  })
})

describe('POST /auth/refresh — session bootstrap', () => {
  it('returns the user so the client does not need a second /auth/me round trip', async () => {
    const raw = 'refresh-token-raw'
    handlers['refreshToken.findUnique'] = (a) =>
      a.where.tokenHash === hashToken(raw)
        ? { id: 'rt1', userId: 'u1', expiresAt: new Date(Date.now() + 86_400_000) }
        : null
    handlers['user.findUnique'] = () => ({
      id: 'u1', name: 'U', email: 'u1@x.dev', role: 'OWNER', teamId: 'team_1', avatarUrl: null,
      timezone: 'UTC', lastLoginAt: null, onboardingCompleted: false,
      team: { ...TEAM, scimTokenHash: 'secret' },
    })
    const req: any = { cookies: { rapto_refresh: raw }, body: {}, headers: {}, ip: '127.0.0.1' }
    const res: any = { cookie: jest.fn() }
    const m = await measure(() => authService.refresh(req, res))
    report['refresh'] = { trips: m.trips, serial: m.serial, ms: m.ms }

    expect(m.result.accessToken).toEqual(expect.any(String))
    expect(m.result.user).toMatchObject({ id: 'u1', teamId: 'team_1', onboardingCompleted: false })
    expect(m.result.user.team).toEqual({ id: 'team_1', name: 'Acme', slug: 'acme', plan: 'FREE' })
  })
})
