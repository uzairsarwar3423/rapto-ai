// ─────────────────────────────────────────────────────────────────────────────
// test-db.ts — Database Isolation & Test Seeding Lifecycle Helpers
//
// Provides reproducible, isolated fixture seeding and database cleanup using Prisma.
// Per-test data isolation ensures no test relies on shared state from prior runs.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from '../../src/db/client'
import { TeamProvider, CalendarProvider, PriorityLevel, PlatformType, MeetingStatus } from '@prisma/client'
import { encrypt } from '../../src/utils/crypto'

export async function cleanTestDatabase() {
    // Delete in reverse FK dependency order
    await prisma.actionItem.deleteMany()
    await prisma.commitment.deleteMany()
    await prisma.decision.deleteMany()
    await prisma.blocker.deleteMany()
    await prisma.risk.deleteMany()
    await prisma.meetingParticipant.deleteMany()
    await prisma.meeting.deleteMany()
    await prisma.teamIntegration.deleteMany()
    await prisma.userIntegration.deleteMany()
    await prisma.teamInvitation.deleteMany()
    await prisma.notificationPreference.deleteMany()
    await prisma.subscription.deleteMany().catch(() => {})
    await prisma.usageEvent.deleteMany().catch(() => {})
    await prisma.user.deleteMany()
    await prisma.team.deleteMany()
}


export async function seedTestTeam(override: { name?: string; slug?: string; settings?: any } = {}) {
    const uniqueId = Math.random().toString(36).substring(2, 9)
    return prisma.team.create({
        data: {
            name: override.name || `Test Team ${uniqueId}`,
            slug: override.slug || `test-team-${uniqueId}`,
            plan: 'STARTER',
            settings: override.settings !== undefined ? override.settings : undefined,
        },
    })
}

export async function seedTestUser(teamId: string, override: { email?: string; name?: string; role?: any } = {}) {
    const uniqueId = Math.random().toString(36).substring(2, 9)
    return prisma.user.create({
        data: {
            email: override.email || `test.user.${uniqueId}@vocaply.dev`,
            name: override.name || `Test User ${uniqueId}`,
            teamId,
            role: override.role || 'MEMBER',
        },
    })
}

export async function seedTestTeamIntegration(
    teamId: string,
    provider: TeamProvider,
    override: {
        accessToken?: string
        refreshToken?: string
        expiresAt?: Date | null
        workspaceId?: string
        isActive?: boolean
        consecutiveErrors?: number
        lastError?: string | null
        metadata?: any
    } = {}
) {
    const rawToken = override.accessToken || `tok_${provider.toLowerCase()}_secret_123`
    const encToken = encrypt(rawToken)
    const encRefresh = override.refreshToken ? encrypt(override.refreshToken) : null

    return prisma.teamIntegration.create({
        data: {
            teamId,
            provider,
            accessTokenEnc: encToken,
            refreshTokenEnc: encRefresh,
            tokenExpiresAt: override.expiresAt !== undefined ? override.expiresAt : new Date(Date.now() + 3600_000),
            workspaceId: override.workspaceId || `ws-${provider.toLowerCase()}-001`,
            workspaceName: `Test ${provider} Workspace`,
            metadata: override.metadata !== undefined ? override.metadata : {},
            isActive: override.isActive !== undefined ? override.isActive : true,
            consecutiveErrors: override.consecutiveErrors || 0,
            lastError: override.lastError || null,
        },
    })
}

export async function seedTestUserIntegration(
    userId: string,
    provider: CalendarProvider,
    override: {
        accessToken?: string
        refreshToken?: string
        expiresAt?: Date | null
        calendarId?: string
        lastSyncedAt?: Date
        nextSyncToken?: string
        consecutiveErrors?: number
        lastError?: string | null
    } = {}
) {
    const rawToken = override.accessToken || `tok_${provider.toLowerCase()}_user_secret`
    const encToken = encrypt(rawToken)
    const encRefresh = override.refreshToken ? encrypt(override.refreshToken) : null

    return prisma.userIntegration.create({
        data: {
            userId,
            provider,
            accessTokenEnc: encToken,
            refreshTokenEnc: encRefresh,
            tokenExpiresAt: override.expiresAt !== undefined ? override.expiresAt : new Date(Date.now() + 3600_000),
            calendarId: override.calendarId || 'primary',
            lastSyncedAt: override.lastSyncedAt || null,
            nextSyncToken: override.nextSyncToken || null,
            consecutiveErrors: override.consecutiveErrors || 0,
            lastError: override.lastError || null,
        },
    })
}

export async function seedTestMeeting(teamId: string, override: { title?: string; platform?: PlatformType } = {}) {
    return prisma.meeting.create({
        data: {
            teamId,
            title: override.title || 'Architecture Sync',
            platform: override.platform || PlatformType.GOOGLE_MEET,
            meetingUrl: 'https://meet.google.com/abc-defg-hij',
            scheduledAt: new Date(),
            status: MeetingStatus.TRANSCRIBED,
        },
    })
}

export async function seedTestActionItem(
    teamId: string,
    meetingId: string,
    override: {
        text?: string
        assigneeId?: string
        priority?: PriorityLevel
        jiraIssueId?: string
        jiraIssueUrl?: string
        linearIssueId?: string
        linearIssueUrl?: string
        notionPageId?: string
        notionPageUrl?: string
        confidenceScore?: number
    } = {}
) {
    return prisma.actionItem.create({
        data: {
            teamId,
            meetingId,
            assigneeId: override.assigneeId || null,
            text: override.text || 'Implement automated integration test suite',
            priority: override.priority || PriorityLevel.HIGH,
            jiraIssueId: override.jiraIssueId || null,
            jiraIssueUrl: override.jiraIssueUrl || null,
            linearIssueId: override.linearIssueId || null,
            linearIssueUrl: override.linearIssueUrl || null,
            notionPageId: override.notionPageId || null,
            notionPageUrl: override.notionPageUrl || null,
            confidenceScore: override.confidenceScore !== undefined ? override.confidenceScore : 1.0,
        },
    })
}

