import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { env } from '../../config/env'
import { AuthUser } from './auth.types'

/**
 * Generates a stateless JWT access token valid for 15 minutes.
 */
export function generateAccessToken(user: { id: string; teamId: string | null; role: any; email: string }): string {
  return jwt.sign(
    {
      sub: user.id,
      teamId: user.teamId,
      role: user.role,
      email: user.email,
    },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: '15m',
      algorithm: 'HS256',
      issuer: 'vocaply.com',
      audience: 'vocaply-api',
    }
  )
}

/**
 * Generates a high-entropy 64-character hex refresh token (random 32 bytes).
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Hashes a token using SHA-256 before storing it in the database.
 * This prevents session hijacking in case of a database compromise.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Secure HTTP-only cookie configuration for the refresh token.
 *
 * path: '/'  — Must be '/' so the browser sends this cookie on ANY request
 *              to the API domain. '/api/v1/auth/refresh' was wrong — it
 *              prevented the cookie from being readable by the refresh endpoint
 *              when called via the BFF proxy at /api/v1/auth/refresh, and also
 *              blocked the cookie from being sent after cross-origin redirects.
 *
 * sameSite: 'lax' — Required for OAuth flows. 'strict' blocks the cookie on
 *              the very first GET request after Google redirects back to the app
 *              (cross-site navigation triggers the 'strict' block). 'lax' allows
 *              the cookie on top-level cross-site GET navigations (safe — refresh
 *              tokens are only used on POST /auth/refresh, not GETs).
 *
 * secure: true in production — cookie only sent over HTTPS.
 */
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
}
