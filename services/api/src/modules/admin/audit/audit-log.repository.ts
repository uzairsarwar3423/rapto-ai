import { prisma } from '../../../db/client'

export const auditLogRepository = {
  create(data: {
    adminUserId?: string | null
    action: string
    targetType?: string | null
    targetId?: string | null
    metadata?: Record<string, unknown>
    ipAddress?: string | null
  }) {
    return prisma.adminAuditLog.create({
      data: {
        adminUserId: data.adminUserId ?? null,
        action: data.action,
        targetType: data.targetType ?? null,
        targetId: data.targetId ?? null,
        metadata: (data.metadata ?? {}) as any,
        ipAddress: data.ipAddress ?? null,
      },
    })
  },

  findByFilters(
    filters: { adminUserId?: string; targetType?: string; targetId?: string },
    cursor?: string,
    limit = 50
  ) {
    return prisma.adminAuditLog.findMany({
      where: filters,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    })
  },
}
