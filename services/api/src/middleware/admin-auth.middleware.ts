import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { UnauthorizedError } from '../utils/errors'
import { env } from '../config/env'
import type { AdminJwtPayload } from '../modules/admin/admin-auth/admin-auth.types'

export function adminAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('AUTH_REQUIRED', 'Admin authentication required.'))
  }
  const token = authHeader.split(' ')[1]

  try {
    const payload = jwt.verify(token, env.ADMIN_JWT_SECRET, {
      algorithms: ['HS256'],
      audience: 'rapto-admin', // Customer token with aud: 'rapto-api' fails HERE
      issuer: 'rapto.cloud',
    }) as AdminJwtPayload

    req.adminUser = {
      id: payload.sub,
      role: payload.role,
      mfaVerified: payload.mfaVerified,
    }
    next()
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new UnauthorizedError('TOKEN_EXPIRED', 'Session expired.'))
    }
    return next(new UnauthorizedError('TOKEN_INVALID', 'Invalid admin session.'))
  }
}
