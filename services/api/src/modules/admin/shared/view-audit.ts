import { redis } from '../../../config/redis'
import { logger } from '../../../config/logger'
import { auditLogService } from '../audit/audit-log.service'
import type { AuditTargetType, AuditViewAction } from './audit-actions'

/** One "viewed" entry per admin + target per window. Opening the same drawer repeatedly must not flood the audit log. */
export const VIEW_AUDIT_DEDUPE_SECONDS = 600

/**
 * Record that a staff member viewed a user/team detail — at most once per admin+action+target per 10 minutes.
 *
 * NEVER throws and never blocks a read: if Redis is unavailable the entry is skipped (a missed "viewed" row is
 * acceptable; a failed drawer is not). The audit-log write itself already swallows its own errors.
 *
 * Callers should NOT await it on the response path (`void auditViewOnce(...)`).
 */
export async function auditViewOnce(
  adminId: string,
  action: AuditViewAction,
  target: { type: AuditTargetType; id: string },
  ip?: string,
): Promise<void> {
  try {
    const key = `audit:view:${adminId}:${action}:${target.id}`
    // SET key 1 EX 600 NX → 'OK' only for the first caller inside the window.
    const first = await redis.set(key, '1', 'EX', VIEW_AUDIT_DEDUPE_SECONDS, 'NX')
    if (first === 'OK') await auditLogService.write(adminId, action, {}, ip, target)
  } catch (err: any) {
    logger.warn({ err: err?.message, action, targetId: target.id }, 'view audit skipped (dedupe store unavailable)')
  }
}
