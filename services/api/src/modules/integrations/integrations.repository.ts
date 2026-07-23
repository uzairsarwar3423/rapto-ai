import { TeamIntegration, Prisma, UserIntegration } from '@prisma/client'
import { prisma } from '../../db/client'
import { ProviderType, TeamIntegrationSummary } from './integrations.types'
import { addMinutes } from 'date-fns'

export class IntegrationsRepository {
    async findActiveCalendarIntegration(userId: string): Promise<UserIntegration | null> {
        return prisma.userIntegration.findFirst({
            where: {
                userId,
                syncEnabled: true,
            },
        })
    }

    async findByTeamAndProvider(
        teamId: string,
        provider: ProviderType
    ): Promise<TeamIntegration | null> {
        return prisma.teamIntegration.findUnique({
            where: {
                teamId_provider: {
                    teamId,
                    provider,
                },
            },
        })
    }

    async findAllByTeam(teamId: string): Promise<TeamIntegrationSummary[]> {
        const integrations = await prisma.teamIntegration.findMany({
            where: { teamId },
            select: {
                provider: true,
                workspaceName: true,
                isActive: true,
                lastSyncedAt: true,
                consecutiveErrors: true,
                lastError: true,
                connectedBy: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        })

        return integrations.map((i) => ({
            provider: i.provider as ProviderType,
            workspaceName: i.workspaceName,
            isActive: i.isActive,
            lastSyncedAt: i.lastSyncedAt,
            consecutiveErrors: i.consecutiveErrors,
            lastError: i.lastError,
            connectedBy: i.connectedBy
                ? {
                      id: i.connectedBy.id,
                      name: i.connectedBy.name,
                  }
                : null,
        }))
    }

    async upsert(
        teamId: string,
        provider: ProviderType,
        data: {
            accessTokenEnc: string
            refreshTokenEnc: string | null
            tokenExpiresAt: Date | null
            workspaceId: string
            workspaceName?: string
            workspaceUrl?: string
            metadata?: Record<string, unknown>
            isActive: boolean
            consecutiveErrors: number
            connectedById: string
        }
    ): Promise<TeamIntegration> {
        const metadataJson = data.metadata ? (data.metadata as Prisma.InputJsonValue) : undefined
        return prisma.teamIntegration.upsert({
            where: {
                teamId_provider: {
                    teamId,
                    provider,
                },
            },
            create: {
                teamId,
                provider,
                ...data,
                metadata: metadataJson,
                lastError: null,
            },
            update: {
                ...data,
                metadata: metadataJson,
                disconnectedById: null,
                disconnectedAt: null,
                lastError: null,
            },
        })
    }

    async updateTokens(
        integrationId: string,
        accessTokenEnc: string,
        refreshTokenEnc: string | null,
        tokenExpiresAt: Date | null
    ): Promise<void> {
        await prisma.teamIntegration.update({
            where: { id: integrationId },
            data: {
                accessTokenEnc,
                ...(refreshTokenEnc && { refreshTokenEnc }),
                tokenExpiresAt,
            },
        })
    }

    async markDisconnected(
        integrationId: string,
        disconnectedById: string | null
    ): Promise<void> {
        await prisma.teamIntegration.update({
            where: { id: integrationId },
            data: {
                isActive: false,
                disconnectedAt: new Date(),
                disconnectedById,
            },
        })
    }

    async incrementErrorCount(integrationId: string): Promise<number> {
        const result = await prisma.teamIntegration.update({
            where: { id: integrationId },
            data: {
                consecutiveErrors: {
                    increment: 1,
                },
            },
            select: {
                consecutiveErrors: true,
            },
        })
        return result.consecutiveErrors
    }

    async resetErrorCount(integrationId: string): Promise<void> {
        await prisma.teamIntegration.update({
            where: { id: integrationId },
            data: {
                consecutiveErrors: 0,
                lastError: null,
            },
        })
    }

    async findExpiringTokens(withinMinutes: number): Promise<TeamIntegration[]> {
        const threshold = addMinutes(new Date(), withinMinutes)
        return prisma.teamIntegration.findMany({
            where: {
                isActive: true,
                tokenExpiresAt: {
                    lt: threshold,
                },
            },
        })
    }

    /**
     * updateMetadata — JSONB merge-update, not blind overwrite.
     * Mirrors the Day 16 updateTeamSettings() merge pattern:
     * { ...existing.metadata, ...metadataPatch }
     *
     * A PATCH .../configure call setting only `projectKey` never
     * clobbers an already-configured `defaultIssueType` (§12).
     */
    async updateMetadata(
        teamId: string,
        provider: ProviderType,
        patch: Record<string, unknown>
    ): Promise<TeamIntegration> {
        const existing = await this.findByTeamAndProvider(teamId, provider)
        if (!existing) {
            throw new Error(`Integration not found: ${teamId}/${provider}`)
        }

        const existingMetadata = (existing.metadata as Record<string, unknown>) ?? {}
        const mergedMetadata = { ...existingMetadata, ...patch }

        return prisma.teamIntegration.update({
            where: { id: existing.id },
            data: { metadata: mergedMetadata as Prisma.InputJsonValue },
        })
    }

    /**
     * disableIntegration — used by the auto-disable flow when consecutiveErrors >= 5.
     * Sets isActive=false and records lastError without a full disconnect audit record.
     */
    async disableIntegration(integrationId: string, reason: string): Promise<void> {
        await prisma.teamIntegration.update({
            where: { id: integrationId },
            data: {
                isActive: false,
                lastError: reason.substring(0, 1000),
            },
        })
    }
}

export const integrationsRepository = new IntegrationsRepository()
