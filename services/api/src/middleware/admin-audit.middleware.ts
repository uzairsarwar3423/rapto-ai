import type { Request, Response, NextFunction } from 'express'
import { auditLogService } from '../modules/admin/audit/audit-log.service'

export function adminAuditMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET') return next()

  res.on('finish', () => {
    const action = `${req.method}:${req.baseUrl || ''}${req.route?.path ?? req.path}`
    auditLogService
      .write(
        req.adminUser?.id ?? null,
        action,
        { statusCode: res.statusCode },
        req.ip
      )
      .catch((err) => {
        // Audit logging must NEVER throw into the response cycle
        console.error('admin-audit.middleware: failed to write audit entry', err)
      })
  })

  next()
}
