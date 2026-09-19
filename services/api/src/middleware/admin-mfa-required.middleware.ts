import type { Request, Response, NextFunction } from 'express'
import { ForbiddenError } from '../utils/errors'

export function adminMfaRequiredMiddleware(req: Request, _res: Response, next: NextFunction) {
  if (req.adminUser?.mfaVerified !== true) {
    return next(new ForbiddenError('Multi-factor authentication required.'))
  }
  next()
}
