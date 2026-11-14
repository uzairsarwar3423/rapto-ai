// ─────────────────────────────────────────────────────────────────────────────
// teams.repository.ts — Database Layer (Prisma Queries Only)
//
// RULES:
//   ✅ Prisma queries only — never business logic, never HTTP knowledge
//   ✅ Returns domain objects or null — never throws custom errors
//   ✅ All queries use indexed columns: teamId, email, slug, tokenHash
//   ✅ Never selects: passwordHash, totpSecretEnc, failedLoginAttempts, lockedUntil
// ─────────────────────────────────────────────────────────────────────────────

import { UserRole } from '@prisma/client'
import { prisma } from '../../db/client'
import type { CreateTeamData, CreateInvitationData, ListMembersQuery } from './teams.types'
import { IN_FLIGHT_STATUSES } from '../meetings/meetings.service.state'

// ── Safe member select (never expose sensitive fields) ────────────────────────

const SAFE_MEMBER_SELECT = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  role: true,
  commitmentScore: true,
  lastActiveAt: true,
  lastLoginAt: true,
  createdAt: true,
  deletedAt: true,
} as const

// ── Team CRUD ─────────────────────────────────────────────────────────────────

/**
 * Find a team by ID, including member count and meeting count.
 */
async function findById(id: string) {
  return prisma.team.findUnique({
    where: { id },
    include: {
      members: {
        where: { deletedAt: null },
        select: SAFE_MEMBER_SELECT,
        orderBy: [
          // SQL-level role ordering: OWNER → ADMIN → MANAGER → MEMBER
          { role: 'asc' }, // Prisma sorts enums alphabetically; we override with a custom sort in service
        ],
      },
      _count: {
        select: { meetings: true },
      },
    },
  })
}

/**
 * Find a team by slug (case-insensitive — slugs are always stored lowercase).
 */
async function findBySlug(slug: string) {
  return prisma.team.findFirst({
    where: {
      slug: slug.toLowerCase(),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      plan: true,
    },
  })
}

/**
 * Which of the given slugs already exist? One indexed IN query.
 * Slugs are stored lowercase, so exact matching is sufficient.
 */
async function findExistingSlugs(slugs: string[]): Promise<Set<string>> {
  if (slugs.length === 0) return new Set()
  const rows = await prisma.team.findMany({
    where: { slug: { in: slugs.map((s) => s.toLowerCase()) } },
    select: { slug: true },
  })
  return new Set(rows.map((r) => r.slug))
}

/** Thrown inside the create transaction when the user already belongs to a team. */
export class UserAlreadyInTeamError extends Error {
  constructor() {
    super('User already belongs to a team')
    this.name = 'UserAlreadyInTeamError'
  }
}

/**
 * Create a team and assign the creator as OWNER — in ONE transaction.
 *
 * Concurrency guarantees:
 *   • The UNIQUE index on teams.slug rejects a duplicate slug (Prisma P2002);
 *     the whole transaction rolls back and the service retries with a new slug.
 *   • The user is claimed with `updateMany WHERE teamId IS NULL`. If two
 *     requests race for the same user, the loser blocks on the row lock, sees
 *     teamId already set, matches 0 rows, and rolls back its team — so a user
 *     can never end up owning two freshly created teams.
 */
async function create(data: CreateTeamData) {
  return prisma.$transaction(async (tx) => {
    const team = await tx.team.create({
      data: {
        name: data.name,
        slug: data.slug,
        plan: 'FREE',
        settings: {},
      },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        createdAt: true,
      },
    })

    const claimed = await tx.user.updateMany({
      where: { id: data.creatorId, teamId: null },
      data: {
        teamId: team.id,
        role: UserRole.OWNER,
        onboardingCompleted: false,
      },
    })
    if (claimed.count !== 1) {
      throw new UserAlreadyInTeamError()
    }

    // Default notification preferences (upsert — safe if already exists)
    await tx.notificationPreference.upsert({
      where: { userId: data.creatorId },
      create: {
        userId: data.creatorId,
        preferences: {
          emailOnCommitmentMissed: true,
          emailOnDeadlineToday: true,
          emailOnDeadlineTomorrow: true,
          emailWeeklyDigest: true,
          weeklyDigestDay: 'MONDAY',
          slackOnCommitmentMissed: true,
          slackOnDeadlineToday: true,
          inAppAll: true,
        },
      },
      update: {}, // no-op if exists
    })

    return team
  })
}

/**
 * Update team name and/or settings.
 * For settings: caller should merge JSONB before calling (partial update pattern).
 */
async function update(
  id: string,
  data: { name?: string; settings?: Record<string, unknown>; updatedAt?: Date }
) {
  return prisma.team.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.settings !== undefined && { settings: data.settings as object }),
      updatedAt: data.updatedAt ?? new Date(),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      plan: true,
      settings: true,
      updatedAt: true,
    },
  })
}

// ── Member Management ─────────────────────────────────────────────────────────

/**
 * List team members with optional role filter and search, paginated.
 * Uses OFFSET pagination (not cursor) — total count needed for admin UI.
 */
async function findMembers(teamId: string, query: ListMembersQuery) {
  const page = Number(query.page ?? 1)
  const limit = Number(query.limit ?? 20)
  const skip = (page - 1) * limit

  const where = {
    teamId,
    deletedAt: null as null,
    ...(query.role && { role: query.role }),
    ...(query.search && {
      OR: [
        { name: { contains: query.search, mode: 'insensitive' as const } },
        { email: { contains: query.search, mode: 'insensitive' as const } },
      ],
    }),
  }

  const [members, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: SAFE_MEMBER_SELECT,
      orderBy: [
        { role: 'asc' }, // refined in service layer with custom sort
        { createdAt: 'asc' },
      ],
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ])

  return { members, total, page, limit }
}

/**
 * Find a single member within a team (verifies team membership).
 * Returns null if user does not belong to this team.
 */
async function findMemberById(teamId: string, userId: string) {
  return prisma.user.findFirst({
    where: { id: userId, teamId, deletedAt: null },
    select: SAFE_MEMBER_SELECT,
  })
}

/**
 * Update a member's role within their current team.
 */
async function updateMemberRole(userId: string, role: UserRole) {
  return prisma.user.update({
    where: { id: userId },
    data: { role },
    select: {
      id: true,
      name: true,
      role: true,
      updatedAt: true,
    },
  })
}

/**
 * Remove a member from a team atomically.
 * - Clears teamId and resets role to MEMBER
 * - Deletes ALL refresh tokens for immediate forced logout
 * - Historical data (commitments, action items) is NOT deleted
 */
async function removeMember(userId: string) {
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        teamId: null,
        role: UserRole.MEMBER, // reset to default for next team
      },
    }),
    prisma.refreshToken.deleteMany({
      where: { userId },
    }),
  ])
}

// ── Invitation Management ─────────────────────────────────────────────────────

/**
 * Find a pending (non-accepted) invitation for a team + email combination.
 */
async function findPendingInvite(teamId: string, email: string) {
  return prisma.teamInvitation.findFirst({
    where: {
      teamId,
      invitedEmail: email.toLowerCase(),
      acceptedAt: null,
      expiresAt: { gt: new Date() }, // only non-expired
    },
  })
}

/**
 * Create a new team invitation record.
 * tokenHash = sha256(rawToken) — raw token is never stored.
 */
async function createInvitation(data: CreateInvitationData) {
  return prisma.teamInvitation.create({
    data: {
      teamId: data.teamId,
      invitedEmail: data.invitedEmail.toLowerCase(),
      invitedRole: data.invitedRole,
      invitedById: data.invitedById,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
    },
  })
}

/**
 * Find an invitation by its token hash.
 * Used during invite acceptance to verify the token.
 */
async function findInvitationByToken(tokenHash: string) {
  return prisma.teamInvitation.findUnique({
    where: { tokenHash },
    include: {
      team: {
        select: { id: true, name: true, plan: true },
      },
    },
  })
}

/**
 * Mark an invitation as accepted.
 */
async function acceptInvitation(id: string, acceptedById: string) {
  return prisma.teamInvitation.update({
    where: { id },
    data: {
      acceptedAt: new Date(),
      acceptedById,
    },
  })
}

/**
 * Count pending (non-accepted, non-expired) invitations for a team.
 * Used when checking projected member count before sending new invites.
 */
async function countPendingInvitations(teamId: string): Promise<number> {
  return prisma.teamInvitation.count({
    where: {
      teamId,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
  })
}

/**
 * Delete expired invitations for a team (housekeeping).
 * Returns the count of deleted records.
 */
async function deleteExpiredInvitations(teamId: string): Promise<number> {
  const result = await prisma.teamInvitation.deleteMany({
    where: {
      teamId,
      acceptedAt: null,
      expiresAt: { lt: new Date() },
    },
  })
  return result.count
}

// ── Usage ─────────────────────────────────────────────────────────────────────

/**
 * Get team usage stats: meetingsUsed + active member count.
 */
async function getUsage(teamId: string) {
  const [team, inFlightMeetings] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamId },
      select: {
        meetingsUsed: true,
        plan: true,
        billingCycleEnd: true,
        _count: { select: { members: { where: { deletedAt: null } } } },
      },
    }),
    prisma.meeting.count({
      where: {
        teamId,
        status: { in: IN_FLIGHT_STATUSES },
      },
    }),
  ])

  return {
    meetingsUsed: (team?.meetingsUsed ?? 0) + inFlightMeetings,
    membersCount: team?._count?.members ?? 0,
    plan: team?.plan ?? 'FREE',
    billingCycleEnd: team?.billingCycleEnd ?? null,
  }
}

/**
 * Increment the team's meetingsUsed counter atomically.
 */
async function incrementMeetingsUsed(teamId: string) {
  return prisma.team.update({
    where: { id: teamId },
    data: { meetingsUsed: { increment: 1 } },
  })
}

// ── Export ────────────────────────────────────────────────────────────────────

export const teamsRepository = {
  // Team CRUD
  findById,
  findBySlug,
  findExistingSlugs,
  create,
  update,

  // Member management
  findMembers,
  findMemberById,
  updateMemberRole,
  removeMember,

  // Invitation management
  findPendingInvite,
  createInvitation,
  findInvitationByToken,
  acceptInvitation,
  countPendingInvitations,
  deleteExpiredInvitations,

  // Usage
  getUsage,
  incrementMeetingsUsed,
}
