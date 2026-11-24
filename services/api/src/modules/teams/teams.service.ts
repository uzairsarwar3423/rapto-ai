// ─────────────────────────────────────────────────────────────────────────────
// teams.service.ts — All Teams Business Logic
//
// RULES:
//   ✅ Calls repository, Redis, email service, Socket.io — nothing else
//   ✅ Throws typed AppError subclasses — never plain Error
//   ✅ Never reads req/res — pure business logic, fully testable
//   ✅ Cache-Aside pattern: write DB → delete cache (not update)
//   ✅ All side effects (email, socket) are non-blocking
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'crypto'
import { PlanType, UserRole } from '@prisma/client'
import { getTeamEntitlement } from '../billing/entitlement.service'
import { ttlSecondsUntil } from '../billing/entitlement'
import { teamsRepository, UserAlreadyInTeamError } from './teams.repository'
import { SLUG_MAX_LENGTH, isValidSlug, slugify, toBaseSlug, withSuffix } from '../../utils/slug'
import { notifyQueue } from '../../queues/queue.client'
import { emailService } from '../notifications/email.service'
import { prisma } from '../../db/client'
import { redis } from '../../config/redis'
import { logger } from '../../config/logger'
import { env, getFrontendUrl } from '../../config/env'
import { generateAccessToken } from '../auth/auth.helpers'
import {
  PLAN_LIMITS,
  RESERVED_SLUGS,
  ROLE_LEVELS,
  getUpgradeUrl,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '../../config/plans.config'
import {
  AppError,
  ForbiddenError,
  NotFoundError,
  DuplicateError,
  PlanLimitError,
} from '../../utils/errors'
import type {
  CreateTeamInput,
  UpdateTeamInput,
  InviteMembersInput,
  ListMembersQuery,
  TeamDetailResponse,
  TeamSettings,
  TeamUsage,
  MemberSummary,
  InviteResult,
  SlugAvailabilityResponse,
} from './teams.types'
import { IN_FLIGHT_STATUSES } from '../meetings/meetings.service.state'

// ── Cache Helpers ─────────────────────────────────────────────────────────────

const TEAM_DETAIL_TTL = 300   // 5 minutes
const TEAM_MEMBERS_TTL = 300  // 5 minutes

const CK = {
  teamDetail: (id: string) => `cache:team:detail:${id}`,
  teamMembers: (id: string) => `cache:team:members:${id}`,
  user: (id: string) => `cache:user:${id}`,
}

async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const v = await redis.get(key)
    return v ? (JSON.parse(v) as T) : null
  } catch {
    return null
  }
}

async function cacheSet(key: string, ttl: number, value: unknown): Promise<void> {
  try {
    await redis.setex(key, ttl, JSON.stringify(value))
  } catch {
    // Non-fatal
  }
}

async function cacheDel(...keys: string[]): Promise<void> {
  try {
    if (keys.length > 0) await redis.del(...keys)
  } catch {
    // Non-fatal
  }
}

async function cacheDelPrefix(prefix: string): Promise<void> {
  try {
    const keys = await redis.keys(`${prefix}*`)
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  } catch (err) {
    logger.error({ err, prefix }, 'Failed to delete prefix cache keys')
  }
}

// ── Slug Utilities ────────────────────────────────────────────────────────────

function randomSuffix(length = 4): string {
  return crypto.randomBytes(length).toString('hex').slice(0, length)
}

/** Candidates probed per DB round trip when hunting for a free slug. */
const SLUG_PROBE_BATCH = 25
/** Sequential suffixes tried (-1 … -N) before falling back to a random one. */
const SLUG_MAX_SEQUENTIAL = 1000
/**
 * Create retries after losing a slug race to a concurrent request. Retry k picks
 * randomly among the first 2^k free slugs, so contenders spread out quickly; the
 * final attempt uses a random suffix, which cannot realistically collide.
 */
const SLUG_CREATE_MAX_RETRIES = 6

/** Prisma unique-constraint violation on the slug column / index. */
function isSlugConflict(err: unknown): boolean {
  const e = err as { code?: string; meta?: { target?: unknown } } | null
  if (!e || e.code !== 'P2002') return false
  const target = e.meta?.target
  const text = Array.isArray(target) ? target.join(',') : String(target ?? '')
  return text.includes('slug')
}

/**
 * Find the first available slug for `input`:
 *   base, base-1, base-2, base-3 …
 * Reserved words and invalid input are treated exactly like taken slugs, so
 * "admin" resolves to "admin-1" and "!!!" resolves to "workspace".
 *
 * `skip` returns the (skip+1)-th free slug instead of the first — used only to
 * spread concurrent creators apart after a conflict. Normal lookups use 0.
 *
 * Candidates are probed in batches with one indexed IN query each. This is an
 * optimistic read — the UNIQUE index at insert time is the real guarantee.
 */
async function resolveAvailableSlug(input: string, skip = 0): Promise<string> {
  const base = toBaseSlug(input)
  let seen = 0

  for (let start = 0; start < SLUG_MAX_SEQUENTIAL; start += SLUG_PROBE_BATCH) {
    const candidates: string[] = []
    for (let i = start; i < start + SLUG_PROBE_BATCH; i++) {
      candidates.push(i === 0 ? base : withSuffix(base, i))
    }
    const existing = await teamsRepository.findExistingSlugs(candidates)
    for (const c of candidates) {
      if (existing.has(c) || RESERVED_SLUGS.has(c)) continue
      if (seen === skip) return c
      seen++
    }
  }

  // Pathological (>1000 teams sharing a base): fall back to a random suffix.
  return randomSuffixSlug(base)
}

function randomSuffixSlug(base: string): string {
  return `${base.slice(0, SLUG_MAX_LENGTH - 7).replace(/-+$/, '')}-${randomSuffix(6)}`
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// ── Role Sort (SQL enum order ≠ our desired order) ────────────────────────────

const ROLE_DISPLAY_ORDER: Record<UserRole, number> = {
  OWNER: 0,
  ADMIN: 1,
  MANAGER: 2,
  MEMBER: 3,
}

function sortMembersByRole<T extends { role: UserRole }>(members: T[]): T[] {
  return [...members].sort(
    (a, b) => ROLE_DISPLAY_ORDER[a.role] - ROLE_DISPLAY_ORDER[b.role]
  )
}

import { DEFAULT_TEAM_SETTINGS } from '../../config/team-settings.config'


// ── Service Functions ─────────────────────────────────────────────────────────

/**
 * Create a new team for the given user.
 * Business rules:
 *   - One team per user (v1) — user.teamId must be null
 *   - Slug is auto-generated from name if not provided
 *   - The slug is ALWAYS revalidated here, server-side. If it is taken,
 *     reserved or invalid we pick the next free one (base-1, base-2 …)
 *     instead of failing — the response carries the slug actually used.
 *   - A concurrent request that wins the slug race (UNIQUE violation) makes us
 *     retry with the next free slug, never a 500
 *   - Creator becomes OWNER in one atomic transaction; a user can't end up
 *     owning two teams even under concurrent requests
 */
async function createTeam(userId: string, input: CreateTeamInput) {
  // STEP 1 — Check user not already in a team (fast, friendly failure;
  // the transaction below enforces it again atomically)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, teamId: true },
  })
  if (!user) {
    throw new AppError('USER_NOT_FOUND', 404, 'User not found')
  }
  const alreadyInTeam = () =>
    new ForbiddenError('You are already a member of a team. Leave your current team first.', {
      code: 'ALREADY_IN_TEAM',
    })
  if (user.teamId) {
    throw alreadyInTeam()
  }

  // STEP 2 — Resolve a free slug and create atomically. The optimistic read in
  // resolveAvailableSlug() can lose a race; the UNIQUE index is the arbiter, so
  // on a slug conflict we simply resolve again (the winner's slug is now taken).
  const requested = input.slug ? toBaseSlug(input.slug) : toBaseSlug(input.name)
  let slug = ''
  let team: Awaited<ReturnType<typeof teamsRepository.create>> | null = null

  for (let attempt = 0; attempt <= SLUG_CREATE_MAX_RETRIES; attempt++) {
    if (attempt === 0) {
      slug = await resolveAvailableSlug(requested) // the normal, deterministic answer
    } else if (attempt < SLUG_CREATE_MAX_RETRIES) {
      slug = await resolveAvailableSlug(requested, crypto.randomInt(0, 2 ** attempt))
    } else {
      slug = randomSuffixSlug(toBaseSlug(requested)) // last resort — practically collision-free
    }
    try {
      team = await teamsRepository.create({
        name: input.name.trim(),
        slug,
        creatorId: userId,
      })
      break
    } catch (err) {
      if (err instanceof UserAlreadyInTeamError) throw alreadyInTeam()
      if (isSlugConflict(err) && attempt < SLUG_CREATE_MAX_RETRIES) {
        logger.warn({ slug, attempt }, 'Slug conflict during team creation — retrying with next slug')
        continue
      }
      if (isSlugConflict(err)) {
        throw new DuplicateError('Could not reserve a workspace URL. Please try again.', {
          field: 'slug',
          suggestion: await resolveAvailableSlug(requested),
        })
      }
      throw err
    }
  }
  if (!team) {
    // Unreachable (loop either breaks or throws) — keeps the type checker honest.
    throw new AppError('INTERNAL_ERROR', 500, 'Team creation failed')
  }

  // STEP 6 — Cache invalidation
  await cacheDel(CK.user(userId))

  // STEP 7 — Audit log (fire and forget)
  prisma.usageEvent.create({
    data: {
      teamId: team.id,
      type: 'API_CALL',
      quantity: 1,
      metadata: { event: 'TEAM_CREATED', createdBy: userId },
    },
  }).catch((err: unknown) => logger.error({ err }, 'Failed to write TEAM_CREATED usage event'))

  logger.info({ teamId: team.id, userId, slug }, 'Team created')

  // STEP 8 — Issue a fresh access token reflecting the new teamId.
  //
  // WHY: JWT is stateless. The user's current token still has teamId: null
  // (from before team creation). The next request (e.g. POST /teams/me/invite)
  // hits injectTenant which reads teamId from the JWT — and fails with
  // "You must be part of a team" even though the DB is updated.
  //
  // Solution: return a new accessToken signed with the correct teamId+role so
  // the frontend can swap it in-memory immediately. No page refresh needed.
  //
  // The create transaction set teamId = team.id and role = OWNER for exactly this
  // user (updateMany WHERE teamId IS NULL, count === 1), so the claims are already
  // known — no need to re-read the user row.
  const accessToken = generateAccessToken({
    id: user.id,
    email: user.email,
    teamId: team.id,
    role: UserRole.OWNER,
  })

  return {
    id: team.id,
    name: team.name,
    slug: team.slug,
    // true when the requested URL was unavailable and the next free one was used
    slugAdjusted: team.slug !== requested,
    plan: team.plan,
    createdAt: team.createdAt,
    // Fresh JWT — frontend MUST store this to replace the stale token
    accessToken,
  }
}

/**
 * Get full team detail: team + members + usage stats.
 * Result is cached for 5 minutes.
 */
async function getTeamWithMembers(teamId: string): Promise<TeamDetailResponse> {
  // STEP 1 — Cache check
  const cached = await cacheGet<TeamDetailResponse>(CK.teamDetail(teamId))
  if (cached) return cached

  // STEP 2 — DB fetch
  const [team, inFlightMeetings] = await Promise.all([
    teamsRepository.findById(teamId),
    prisma.meeting.count({
      where: {
        teamId,
        status: { in: IN_FLIGHT_STATUSES },
      },
    }),
  ])
  if (!team) throw new NotFoundError('Team', teamId)

  // STEP 3 — Sort members by role hierarchy
  const sortedMembers = sortMembersByRole(team.members)

  // STEP 4 — Build usage object
  // Effective plan (server clock): an expired trial / ended cancellation is Free even if Team.plan has not been persisted yet.
  const entitlement = await getTeamEntitlement(teamId)
  const plan = entitlement.plan as PlanType
  const limits = PLAN_LIMITS[plan]
  const membersCount = sortedMembers.length
  const meetingsUsed = team.meetingsUsed + inFlightMeetings

  const usage: TeamUsage = {
    meetingsUsed,
    meetingsLimit: limits.meetings,
    meetingsPercent:
      limits.meetings === -1 ? 0 : Math.round((meetingsUsed / limits.meetings) * 100),
    membersCount,
    membersLimit: limits.members,
    membersPercent:
      limits.members === -1 ? 0 : Math.round((membersCount / limits.members) * 100),
    historyDays: limits.historyDays,
    apiAccess: limits.apiAccess,
    ssoEnabled: limits.ssoEnabled,
    billingCycleEnd: team.billingCycleEnd,
  }

  // STEP 5 — Sanitize and shape members
  const members: MemberSummary[] = sortedMembers.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    avatarUrl: m.avatarUrl,
    role: m.role,
    commitmentScore: m.commitmentScore,
    joinedAt: m.createdAt,
    lastActiveAt: m.lastActiveAt,
    lastLoginAt: m.lastLoginAt,
  }))

  // STEP 6 — Build settings (merge with defaults for any missing keys)
  const rawSettings = (team.settings ?? {}) as Record<string, unknown>
  const settings: TeamSettings = {
    defaultTimezone: (rawSettings.defaultTimezone as string) ?? DEFAULT_TEAM_SETTINGS.defaultTimezone,
    weeklyDigestEnabled: (rawSettings.weeklyDigestEnabled as boolean) ?? DEFAULT_TEAM_SETTINGS.weeklyDigestEnabled,
    weeklyDigestDay: (rawSettings.weeklyDigestDay as TeamSettings['weeklyDigestDay']) ?? DEFAULT_TEAM_SETTINGS.weeklyDigestDay,
    allowMembersToInvite: (rawSettings.allowMembersToInvite as boolean) ?? DEFAULT_TEAM_SETTINGS.allowMembersToInvite,
    autoSyncEnabled: (rawSettings.autoSyncEnabled as boolean) ?? DEFAULT_TEAM_SETTINGS.autoSyncEnabled,
    autoSyncProviders: (rawSettings.autoSyncProviders as any) ?? DEFAULT_TEAM_SETTINGS.autoSyncProviders,
  }

  const result: TeamDetailResponse = {
    id: team.id,
    name: team.name,
    slug: team.slug,
    plan,
    settings,
    usage,
    members,
    meetingsCount: team._count.meetings,
    createdAt: team.createdAt,
    updatedAt: team.updatedAt,
  }

  // STEP 7 — Cache result
  // Cache must not outlive the entitlement boundary (e.g. the exact instant a trial ends).
  await cacheSet(CK.teamDetail(teamId), ttlSecondsUntil(entitlement.validUntil, TEAM_DETAIL_TTL), result)

  return result
}

/**
 * Update team name and/or settings.
 * Settings update is a JSONB merge — only provided keys are changed.
 */
async function updateTeamSettings(teamId: string, input: UpdateTeamInput) {
  // STEP 1 — Fetch current state
  const team = await teamsRepository.findById(teamId)
  if (!team) throw new NotFoundError('Team', teamId)

  // STEP 1b — Cross-field validation: autoSyncProviders vs active TeamIntegration rows
  if (input.settings?.autoSyncProviders && input.settings.autoSyncProviders.length > 0) {
    const activeIntegrations = await prisma.teamIntegration.findMany({
      where: { teamId, isActive: true },
      select: { provider: true },
    })
    const activeSet = new Set(activeIntegrations.map((i) => i.provider))
    const invalidProviders = input.settings.autoSyncProviders.filter(
      (p) => !activeSet.has(p as any)
    )
    if (invalidProviders.length > 0) {
      throw new AppError(
        'INVALID_AUTO_SYNC_PROVIDER',
        422,
        `Cannot enable auto-sync for disconnected or inactive provider(s): ${invalidProviders.join(', ')}`
      )
    }
  }

  // STEP 2 — JSONB merge for settings (partial update, not replace)
  const currentSettings = (team.settings ?? {}) as Record<string, unknown>
  const updatedSettings = input.settings
    ? { ...currentSettings, ...input.settings }
    : currentSettings

  // STEP 3 — Update
  const updated = await teamsRepository.update(teamId, {
    name: input.name,
    settings: updatedSettings,
  })

  // STEP 4 — Cache invalidation
  await cacheDel(CK.teamDetail(teamId))

  logger.info({ teamId, changes: Object.keys(input) }, 'Team settings updated')

  const rawSettings = (updated.settings ?? {}) as Record<string, unknown>
  const settings: TeamSettings = {
    defaultTimezone: (rawSettings.defaultTimezone as string) ?? DEFAULT_TEAM_SETTINGS.defaultTimezone,
    weeklyDigestEnabled: (rawSettings.weeklyDigestEnabled as boolean) ?? DEFAULT_TEAM_SETTINGS.weeklyDigestEnabled,
    weeklyDigestDay: (rawSettings.weeklyDigestDay as TeamSettings['weeklyDigestDay']) ?? DEFAULT_TEAM_SETTINGS.weeklyDigestDay,
    allowMembersToInvite: (rawSettings.allowMembersToInvite as boolean) ?? DEFAULT_TEAM_SETTINGS.allowMembersToInvite,
    autoSyncEnabled: (rawSettings.autoSyncEnabled as boolean) ?? DEFAULT_TEAM_SETTINGS.autoSyncEnabled,
    autoSyncProviders: (rawSettings.autoSyncProviders as any) ?? DEFAULT_TEAM_SETTINGS.autoSyncProviders,
  }

  return {
    id: updated.id,
    name: updated.name,
    slug: updated.slug,
    plan: updated.plan,
    settings,
    updatedAt: updated.updatedAt,
  }
}


/**
 * Invite one or more members to the team.
 * Returns a per-email result object: invited | alreadyMember | alreadyInvited | failed.
 */
async function inviteMembers(
  teamId: string,
  inviterId: string,
  input: InviteMembersInput
) {
  const role = input.role ?? UserRole.MEMBER
  const emails = input.emails

  // STEP 1 — Validate role (cannot invite as OWNER — runtime guard, type already excludes it)
  if ((role as string) === 'OWNER') {
    throw new ForbiddenError('Cannot invite members as OWNER')
  }

  // STEP 2 — Independent reads, fetched concurrently: team (+members), pending
  // invite count, effective plan, inviter, and which of the emails are already
  // members / already invited (one batched query each instead of two per email).
  const [team, pendingCount, entitlement, inviter, existingMembers, pendingInvites] = await Promise.all([
    teamsRepository.findById(teamId),
    teamsRepository.countPendingInvitations(teamId),
    getTeamEntitlement(teamId),
    prisma.user.findUnique({
      where: { id: inviterId },
      select: { name: true, email: true },
    }),
    prisma.user.findMany({
      where: { teamId, email: { in: emails } },
      select: { email: true },
    }),
    teamsRepository.findPendingInvites(teamId, emails),
  ])
  if (!team) throw new NotFoundError('Team', teamId)

  // STEP 3 — Plan member limit check (projected total, excluding OWNER who never consumes a seat)
  const currentCount = team.members.filter((m) => m.role !== UserRole.OWNER).length
  const projectedTotal = currentCount + pendingCount + emails.length
  const effectivePlan = entitlement.plan as PlanType
  const memberLimit = PLAN_LIMITS[effectivePlan].members

  if (memberLimit !== -1 && projectedTotal > memberLimit) {
    throw new PlanLimitError('Members', currentCount, memberLimit, getUpgradeUrl(effectivePlan))
  }

  if (!inviter) throw new AppError('USER_NOT_FOUND', 404, 'Inviter not found')

  const memberEmails = new Set(existingMembers.map((m) => m.email.toLowerCase()))
  const pendingByEmail = new Map(pendingInvites.map((i) => [i.invitedEmail, i.id]))

  // STEP 4 — Process each email. Emails are lower-cased and de-duplicated by the
  // validator, so each one touches its own rows and they can run concurrently.
  // A failure is isolated to its email (reported in `failed`), as before.
  const results: Omit<InviteResult, 'inviteLink'> & { inviteLinks: Record<string, string> } = {
    invited: [],
    alreadyMember: [],
    alreadyInvited: [],
    failed: [],
    inviteLinks: {},
  }
  let lastInviteLink: string | null = null

  const frontendUrl = getFrontendUrl()

  const outcomes = await Promise.all(emails.map(async (email) => {
    try {
      // a. Already a team member
      if (memberEmails.has(email.toLowerCase())) {
        return { email, status: 'alreadyMember' as const }
      }

      // b. A pending invite exists — replace it so the email is re-sent with a fresh link
      const pendingInviteId = pendingByEmail.get(email.toLowerCase())
      if (pendingInviteId) {
        await prisma.teamInvitation.delete({
          where: { id: pendingInviteId }
        })
      }

      // c. Generate token (rawToken never stored — only sha256 goes to DB)
      const rawToken = crypto.randomBytes(32).toString('hex') // 256-bit entropy
      const tokenHash = hashToken(rawToken)
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

      // d. Create invitation record
      await teamsRepository.createInvitation({
        teamId,
        invitedEmail: email,
        invitedRole: role,
        invitedById: inviterId,
        tokenHash,
        expiresAt,
      })

      // e. Dispatch team invite email (Industry-standard non-blocking direct send + BullMQ worker queue with Redis idempotency lock)
      const joinUrl = `${frontendUrl}/invite/${rawToken}`
      const dedupKey = `email:sent:invite:${tokenHash}`

      // Acquire Redis idempotency lock to prevent duplicate email dispatches (10 min TTL)
      const acquiredLock = await redis.set(dedupKey, '1', 'EX', 600, 'NX').catch(() => null)

      if (acquiredLock === 'OK') {
        // Direct non-blocking immediate send
        emailService
          .sendTeamInviteEmail({
            to: email,
            teamName: team.name,
            inviterName: inviter.name,
            joinUrl,
            role,
            expiresAt,
          })
          .catch((err) => {
            logger.error({ err: err?.message || err, email, teamId }, 'Direct sendTeamInviteEmail failed')
          })
      }

      // Enqueue to BullMQ for distributed worker processing, retries, and audit log
      await notifyQueue
        .add(
          'TEAM_INVITE_EMAIL',
          {
            type: 'TEAM_INVITE_EMAIL',
            teamId,
            tokenHash,
            emailPayload: {
              to: email,
              teamName: team.name,
              inviterName: inviter.name,
              joinUrl,
              role,
              expiresAt,
            },
          },
          {
            jobId: `team_invite_${tokenHash}`, // BullMQ native job deduplication
          }
        )
        .catch((err) => {
          logger.warn({ err: err?.message || err, email }, 'Failed to queue TEAM_INVITE_EMAIL to BullMQ')
        })

      return { email, status: 'invited' as const, joinUrl }
    } catch (err) {
      logger.error({ err, email, teamId }, 'Error processing invitation for email')
      return { email, status: 'failed' as const }
    }
  }))

  // Collate in request order so the response is deterministic.
  for (const outcome of outcomes) {
    if (outcome.status === 'invited') {
      results.invited.push(outcome.email)
      results.inviteLinks[outcome.email] = outcome.joinUrl
      lastInviteLink = outcome.joinUrl
    } else {
      results[outcome.status].push(outcome.email)
    }
  }

  // STEP 5 — Housekeeping: delete expired invitations (best-effort)
  teamsRepository
    .deleteExpiredInvitations(teamId)
    .catch((err: unknown) => logger.warn({ err, teamId }, 'Failed to delete expired invitations'))

  logger.info(
    { teamId, invited: results.invited.length, failed: results.failed.length },
    'Invitation batch processed'
  )

  // STEP 6 — Return real token invite link for direct sharing (or general join link fallback)
  const inviteLink = lastInviteLink || `${frontendUrl}/teams/${team.slug}/join`

  return { ...results, inviteLink }
}

/**
 * Accept a team invitation using a raw token from the invite URL.
 * User must be authenticated. Token is single-use and expires in 7 days.
 */
async function acceptInvitation(token: string, userId: string) {
  // STEP 1 — Token lookup
  const tokenHash = hashToken(token)
  const invitation = await teamsRepository.findInvitationByToken(tokenHash)
  if (!invitation) {
    throw new AppError('TOKEN_INVALID', 400, 'Invalid or expired invite link')
  }

  // STEP 2 — Expiry check
  if (invitation.expiresAt < new Date()) {
    throw new AppError('TOKEN_EXPIRED', 410, 'This invite link has expired. Ask for a new one.')
  }

  // STEP 3 — Already accepted check
  if (invitation.acceptedAt) {
    throw new AppError('TOKEN_USED', 409, 'This invite link has already been used')
  }

  // STEP 4 — User's current team check
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, teamId: true },
  })
  if (!user) throw new AppError('USER_NOT_FOUND', 404, 'User not found')

  if (user.teamId && user.teamId !== invitation.teamId) {
    throw new ForbiddenError(
      'You are already a member of a different team. Leave it first.',
      { code: 'WRONG_TEAM' }
    )
  }

  // STEP 5 — Atomic transaction: join team + mark invite accepted + create notif prefs
  const [updatedUser] = await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        teamId: invitation.teamId,
        role: invitation.invitedRole,
        onboardingCompleted: true,
      },
    }),
    prisma.teamInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date(), acceptedById: userId },
    }),
    prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      },
      update: {}, // no-op if exists
    }),
  ])

  // STEP 6 — Cache invalidation
  await cacheDel(CK.teamDetail(invitation.teamId), CK.user(userId))
  await cacheDelPrefix(CK.teamMembers(invitation.teamId))

  // STEP 7 — Socket.io event
  const userSummary = {
    id: updatedUser.id,
    name: updatedUser.name,
    email: updatedUser.email,
    avatarUrl: updatedUser.avatarUrl,
    role: updatedUser.role,
    commitmentScore: updatedUser.commitmentScore,
    joinedAt: updatedUser.createdAt,
    lastActiveAt: updatedUser.lastActiveAt,
    lastLoginAt: updatedUser.lastLoginAt,
  };
  import('../../realtime/socket.emitter').then(({ socketEmitter }) => {
    socketEmitter.to(`team:${invitation.teamId}`).emit('member:joined', { user: userSummary })
  }).catch((err) => logger.error({ err }, 'Failed to emit member:joined event'))

  logger.info(
    { userId, teamId: invitation.teamId, role: invitation.invitedRole },
    'Member joined team via invitation'
  )

  // Dispatch Team Member Welcome Email
  try {
    const frontendUrl = getFrontendUrl()
    const dashboardUrl = `${frontendUrl}/dashboard`
    const inviter = invitation.invitedById
      ? await prisma.user
          .findUnique({
            where: { id: invitation.invitedById },
            select: { name: true },
          })
          .catch(() => null)
      : null

    const inviterName = inviter?.name || 'Workspace Administrator'

    console.log('\n===================================================================')
    console.log(`🎉 TEAM MEMBER ACCEPTED INVITE! TRIGGERING WELCOME EMAIL...`)
    console.log(` - Member Email: ${updatedUser.email}`)
    console.log(` - Member Name:  ${updatedUser.name}`)
    console.log(` - Workspace:    ${invitation.team.name}`)
    console.log(` - Inviter:      ${inviterName}`)
    console.log(` - Role:         ${updatedUser.role}`)
    console.log('===================================================================\n')

    // Direct immediate send (non-blocking)
    emailService
      .sendTeamMemberWelcomeEmail({
        to: updatedUser.email,
        memberName: updatedUser.name,
        workspaceName: invitation.team.name,
        inviterName,
        role: updatedUser.role,
        dashboardUrl,
        userId: updatedUser.id,
      })
      .catch((err) => {
        logger.error({ err, userId: updatedUser.id }, 'Direct sendTeamMemberWelcomeEmail failed in acceptInvitation')
      })

    // Also push to BullMQ queue for auditing/worker redundancy if active
    notifyQueue
      .add('EMAIL_TEAM_MEMBER_WELCOME', {
        type: 'EMAIL_TEAM_MEMBER_WELCOME',
        emailPayload: {
          to: updatedUser.email,
          memberName: updatedUser.name,
          workspaceName: invitation.team.name,
          inviterName,
          role: updatedUser.role,
          dashboardUrl,
          userId: updatedUser.id,
        },
      })
      .catch(() => {})
  } catch (err: any) {
    logger.error({ err, userId: updatedUser.id }, 'Failed to trigger team member welcome email')
  }

  return {
    teamId: invitation.teamId,
    teamName: invitation.team.name,
    role: invitation.invitedRole,
    message: "You've joined the team!",
  }

}

/**
 * List team members with optional filters. Result is cached for 5 minutes.
 */
async function listMembers(teamId: string, query: ListMembersQuery) {
  const cacheKey = `${CK.teamMembers(teamId)}:${JSON.stringify(query)}`
  const cachedRaw = await cacheGet<{ members: MemberSummary[]; pagination: { page: number; limit: number; total: number; pages: number; hasMore: boolean } }>(cacheKey)
  if (cachedRaw) return cachedRaw

  const result = await teamsRepository.findMembers(teamId, query)

  // Sort by role hierarchy
  const sorted = sortMembersByRole(result.members)

  const response = {
    members: sorted.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      avatarUrl: m.avatarUrl,
      role: m.role,
      commitmentScore: m.commitmentScore,
      joinedAt: m.createdAt,
      lastActiveAt: m.lastActiveAt,
      lastLoginAt: m.lastLoginAt,
    })) as MemberSummary[],
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      pages: Math.ceil(result.total / result.limit),
      hasMore: result.page * result.limit < result.total,
    },
  }

  await cacheSet(cacheKey, TEAM_MEMBERS_TTL, response)

  return response
}

/**
 * Change a team member's role.
 * Enforces role hierarchy — cannot assign role >= own level.
 */
async function changeMemberRole(
  teamId: string,
  requesterId: string,
  targetUserId: string,
  newRole: Exclude<UserRole, 'OWNER'>
) {
  // STEP 1 — Fetch target
  const target = await teamsRepository.findMemberById(teamId, targetUserId)
  if (!target) throw new NotFoundError('Team member', targetUserId)

  // STEP 2 — Fetch requester role
  const requester = await prisma.user.findUnique({
    where: { id: requesterId },
    select: { role: true },
  })
  if (!requester) throw new AppError('USER_NOT_FOUND', 404, 'Requester not found')

  // STEP 3 — Business rule guards
  if (target.role === UserRole.OWNER) {
    throw new ForbiddenError('Cannot change the OWNER role', { code: 'CANNOT_CHANGE_OWNER' })
  }
  // Note: newRole type is already Exclude<UserRole, 'OWNER'> — OWNER assignment is blocked at type level
  // Additional runtime guard for defense-in-depth:
  if ((newRole as string) === 'OWNER') {
    throw new ForbiddenError('Cannot assign OWNER role directly. Use transfer ownership.', {
      code: 'CANNOT_ASSIGN_OWNER',
    })
  }
  if (targetUserId === requesterId) {
    throw new ForbiddenError('Cannot change your own role', { code: 'CANNOT_CHANGE_SELF' })
  }

  const requesterLevel = ROLE_LEVELS[requester.role] ?? 0
  const targetNewLevel = ROLE_LEVELS[newRole] ?? 0

  if (targetNewLevel >= requesterLevel) {
    throw new ForbiddenError(
      'Cannot assign a role equal to or higher than your own',
      { code: 'ROLE_ESCALATION', yourRole: requester.role, attempted: newRole }
    )
  }

  // STEP 4 — Update
  const updated = await teamsRepository.updateMemberRole(targetUserId, newRole)

  // STEP 5 — Cache invalidation
  await cacheDel(CK.user(targetUserId), CK.teamDetail(teamId))
  await cacheDelPrefix(CK.teamMembers(teamId))

  // STEP 6 — Socket.io event
  import('../../realtime/socket.emitter').then(({ socketEmitter }) => {
    socketEmitter.to(`user:${targetUserId}`).emit('my:role_updated', { newRole })
  }).catch((err) => logger.error({ err }, 'Failed to emit my:role_updated event'))

  logger.info({ teamId, requesterId, targetUserId, newRole }, 'Member role changed')

  return {
    userId: updated.id,
    name: updated.name,
    role: updated.role,
    updatedAt: updated.updatedAt,
  }
}

/**
 * Remove a member from the team.
 * Forces logout by deleting all refresh tokens.
 * Historical data (commitments, action items) is preserved with ownerId.
 */
async function removeMember(
  teamId: string,
  requesterId: string,
  targetUserId: string
) {
  // STEP 1 — Fetch target
  const target = await teamsRepository.findMemberById(teamId, targetUserId)
  if (!target) throw new NotFoundError('Team member', targetUserId)

  // STEP 2 — Fetch requester role
  const requester = await prisma.user.findUnique({
    where: { id: requesterId },
    select: { role: true },
  })
  if (!requester) throw new AppError('USER_NOT_FOUND', 404, 'Requester not found')

  // STEP 3 — Business rule guards
  if (target.role === UserRole.OWNER) {
    throw new ForbiddenError('Cannot remove the team owner', { code: 'CANNOT_REMOVE_OWNER' })
  }
  if (targetUserId === requesterId) {
    throw new ForbiddenError('Cannot remove yourself from the team', { code: 'CANNOT_REMOVE_SELF' })
  }

  const requesterLevel = ROLE_LEVELS[requester.role] ?? 0
  const targetLevel = ROLE_LEVELS[target.role] ?? 0

  if (targetLevel >= requesterLevel) {
    throw new ForbiddenError(
      'Cannot remove a member with an equal or higher role than yours',
      { code: 'INSUFFICIENT_ROLE', yourRole: requester.role, targetRole: target.role }
    )
  }

  // STEP 4 — Atomic removal (clear teamId + delete refresh tokens)
  await teamsRepository.removeMember(targetUserId)

  // STEP 5 — Cache invalidation
  await cacheDel(CK.user(targetUserId), CK.teamDetail(teamId))
  await cacheDelPrefix(CK.teamMembers(teamId))

  // STEP 6 — Socket.io events
  import('../../realtime/socket.emitter').then(({ socketEmitter }) => {
    socketEmitter.to(`user:${targetUserId}`).emit('system:removed_from_team', { teamId })
    socketEmitter.to(`team:${teamId}`).emit('member:removed', { userId: targetUserId })
  }).catch((err) => logger.error({ err }, 'Failed to emit member removal events'))

  // STEP 7 — Audit log (fire and forget)
  prisma.usageEvent.create({
    data: {
      teamId,
      type: 'API_CALL',
      quantity: 1,
      metadata: {
        event: 'MEMBER_REMOVED',
        removedBy: requesterId,
        removedUser: targetUserId,
      },
    },
  }).catch((err: unknown) => logger.error({ err }, 'Failed to write MEMBER_REMOVED usage event'))

  logger.info({ teamId, requesterId, targetUserId }, 'Member removed from team')

  return { message: 'Member removed successfully', userId: targetUserId }
}

/**
 * Check whether a slug is available (public endpoint for the onboarding form).
 *
 * Always answers with the first slug that IS available (`suggestion`), so the
 * client can adopt it in one round trip:
 *   "uzair" free            -> { available: true,  slug: "uzair" }
 *   "uzair" taken           -> { available: false, slug: "uzair", reason: "TAKEN",    suggestion: "uzair-1" }
 *   "uzair", "uzair-1" taken-> suggestion: "uzair-2"
 *   "admin"                 -> { available: false, reason: "RESERVED", suggestion: "admin-1" }
 *   "!!!"                   -> { available: false, reason: "INVALID",  suggestion: "workspace" }
 */
async function checkSlugAvailability(rawSlug: string): Promise<SlugAvailabilityResponse> {
  const slug = slugify(rawSlug)

  if (!isValidSlug(slug)) {
    return {
      available: false,
      slug,
      reason: 'INVALID',
      suggestion: await resolveAvailableSlug(slug),
    }
  }

  const suggestion = await resolveAvailableSlug(slug)
  if (suggestion === slug) {
    return { available: true, slug }
  }

  return {
    available: false,
    slug,
    reason: RESERVED_SLUGS.has(slug) ? 'RESERVED' : 'TAKEN',
    suggestion,
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

export const teamsService = {
  createTeam,
  getTeamWithMembers,
  updateTeamSettings,
  inviteMembers,
  acceptInvitation,
  listMembers,
  changeMemberRole,
  removeMember,
  checkSlugAvailability,
}
