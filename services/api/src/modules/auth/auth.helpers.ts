import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { env } from '../../config/env'

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
      issuer: 'rapto.cloud',
      audience: 'rapto-api',
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
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Production-grade HTTP-only cookie configuration for the refresh token.
 *
 * domain: '.rapto.cloud' in production — CRITICAL for cross-subdomain auth.
 *         Allows both api.rapto.cloud (Express Backend) and rapto.cloud/www.rapto.cloud (Next.js Frontend)
 *         to share and transmit the HttpOnly refresh token seamlessly on page refresh (F5).
 *
 * sameSite: 'none' in production (requires secure: true) — allows browser to send cookie on cross-site XHR.
 * sameSite: 'lax' in development.
 */
const isProd = env.NODE_ENV === 'production'
const cookieDomain = process.env.COOKIE_DOMAIN || (isProd ? '.rapto.cloud' : undefined)

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
  domain: cookieDomain,
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
}
