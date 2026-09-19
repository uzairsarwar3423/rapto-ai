import type { Request, Response, NextFunction } from 'express'
import { ForbiddenError } from '../utils/errors'
import type { AdminRole } from '../modules/admin/admin-auth/admin-auth.types'

const ADMIN_ROLE_LEVEL: Record<AdminRole, number> = {
  SUPER_ADMIN: 4,
  FINANCE: 3,
  SUPPORT: 2,
  READONLY: 1,
}

export function requireAdminRole(minRole: AdminRole) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.adminUser?.role) {
      return next(new ForbiddenError('Admin role information missing.'))
    }
    const userRole = req.adminUser.role as AdminRole
    const userLevel = ADMIN_ROLE_LEVEL[userRole] ?? 0
    const requiredLevel = ADMIN_ROLE_LEVEL[minRole]

    if (userLevel < requiredLevel) {
      return next(new ForbiddenError(`Requires ${minRole} role or higher.`))
    }
    next()
  }
}
