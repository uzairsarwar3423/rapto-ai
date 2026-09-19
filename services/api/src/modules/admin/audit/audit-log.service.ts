import { auditLogRepository } from './audit-log.repository'
import { logger } from '../../../config/logger'

export const auditLogService = {
  async write(
    adminUserId: string | null,
    action: string,
    metadata: Record<string, unknown> = {},
    ipAddress?: string,
    target?: { type: string; id: string }
  ) {
    try {
      await auditLogRepository.create({
        adminUserId,
        action,
        targetType: target?.type,
        targetId: target?.id,
        metadata,
        ipAddress,
      })
    } catch (err) {
      // Never let an audit-write failure block the actual security-relevant action it's describing
      logger.error({ err, action, adminUserId }, 'Failed to write admin audit log entry')
    }
  },
}
