import type { Request, Response, NextFunction } from 'express'
import { ForbiddenError } from '../utils/errors'

const ROLE_LEVELS: Record<string, number> = {
  OWNER: 4,
  ADMIN: 3,
  MANAGER: 2,
  MEMBER: 1,
}

/**
 * Middleware factory to enforce minimum role level requirement.
 * Performs live database role check to prevent stale JWT claims from granting privilege escalation.
 * @param roles Roles that are allowed to access (the minimum of these levels is required).
 */
export function requireRole(...roles: string[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ForbiddenError('Access denied: not authenticated'))
    }

    try {
      const { prisma } = await import('../db/client')
      const liveUser = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { role: true, teamId: true, deletedAt: true },
      })

      if (!liveUser || liveUser.deletedAt || (req.teamId && liveUser.teamId !== req.teamId)) {
        return next(new ForbiddenError('Access denied: user membership invalid or deactivated'))
      }

      // Update in-memory user role from live database state
      req.user.role = liveUser.role
      req.user.teamId = liveUser.teamId

      const userLevel = ROLE_LEVELS[liveUser.role] ?? 0
      const required = Math.min(...roles.map((r) => ROLE_LEVELS[r] ?? 99))

      if (userLevel < required) {
        return next(new ForbiddenError(`Requires role: ${roles.join(' or ')}`))
      }

      next()
    } catch (err) {
      next(err)
    }
  }
}
