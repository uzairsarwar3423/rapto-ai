import bcrypt from 'bcrypt'
import crypto from 'crypto'
import type { Request, Response } from 'express'
import { authRepository } from './auth.repository'
import { encrypt } from '../../utils/crypto'
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  COOKIE_OPTIONS,
} from './auth.helpers'
import { notifyQueue } from '../../queues/queue.client'
import {
  DuplicateError,
  UnauthorizedError,
  RateLimitError,
  AppError,
  ForbiddenError,
} from '../../utils/errors'
import { prisma } from '../../db/client'
import { redis } from '../../config/redis'
import { env, getFrontendUrl } from '../../config/env'
import { logger } from '../../config/logger'
import { teamsService } from '../teams/teams.service'
import { emailService } from '../notifications/email.service'

// Redis TTL for pending invite token (must outlive email verification window)
const PENDING_INVITE_TTL = 24 * 60 * 60 // 24 hours

/**
 * The team fields a client may see on its own user object. The full Team row also
 * carries billing IDs, SSO metadata and the SCIM token hash — never send those.
 */
function toPublicTeam(
  team: { id: string; name: string; slug: string; plan: string } | null | undefined
) {
  return team ? { id: team.id, name: team.name, slug: team.slug, plan: team.plan } : null
}

/** The `user` object returned by /auth/me, /auth/refresh and friends. */
function toPublicUser(user: {
  id: string
  name: string
  email: string
  role: unknown
  teamId: string | null
  team?: { id: string; name: string; slug: string; plan: string } | null
  avatarUrl: string | null
  timezone: string
  lastLoginAt: Date | null
  onboardingCompleted: boolean
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    teamId: user.teamId,
    team: toPublicTeam(user.team),
    avatarUrl: user.avatarUrl,
    timezone: user.timezone,
    lastLoginAt: user.lastLoginAt,
    onboardingCompleted: user.onboardingCompleted,
  }
}

/**
 * Store the raw invite token against the email verification token hash so it can
 * be retrieved when the user clicks their verification link (even in a new tab).
 */
async function storePendingInviteForVerification(
  emailVerificationTokenHash: string,
  inviteToken: string
): Promise<void> {
  await redis.set(
    `pending_invite:verify:${emailVerificationTokenHash}`,
    inviteToken,
    'EX',
    PENDING_INVITE_TTL
  )
}

/**
 * Retrieve and delete the pending invite token linked to an email verification token.
 * Returns null if none was stored.
 */
async function consumePendingInviteForVerification(
  emailVerificationTokenHash: string
): Promise<string | null> {
  const key = `pending_invite:verify:${emailVerificationTokenHash}`
  const inviteToken = await redis.get(key)
  if (inviteToken) await redis.del(key)
  return inviteToken
}

/**
 * Attempt to accept a team invitation for the given user.
 * Silent failure — never blocks primary auth flow.
 */
async function tryAcceptInvitation(userId: string, inviteToken: string): Promise<void> {
  try {
    await teamsService.acceptInvitation(inviteToken, userId)
    logger.info({ userId }, 'Auto-accepted team invitation after account creation/verification')
  } catch (err: unknown) {
    // Log but do NOT rethrow — failing to accept an invite should never break signup/login
    logger.warn({ err, userId }, 'Could not auto-accept invite (token may be expired/invalid/already used)')
  }
}


interface RotatedTokenData {
  accessToken: string
  refreshToken: string
  userId: string
  rotatedAt: number
}

// In-memory fallback for rotated token grace window (handles single-node/local/redis hiccup)
const inMemoryRotatedTokens = new Map<string, RotatedTokenData>()

function cleanupInMemoryRotations() {
  const now = Date.now()
  for (const [hash, entry] of inMemoryRotatedTokens.entries()) {
    if (now - entry.rotatedAt > 60_000) {
      inMemoryRotatedTokens.delete(hash)
    }
  }
}

// A structurally valid cost-12 bcrypt hash of "password" to waste exactly ~300ms
const BCRYPT_FAKE_HASH = '$2b$12$LpyP0uH6O/5j1Z2/V271uO1bHqT9Doz7mFj2.N8F3H5y7kL.Z.fNu'

export const authService = {
  /**
   * Registers a new user, hashes their password, and creates an unverified account.
   * If an inviteToken is provided (user came from an invite link), it is persisted in
   * Redis so it can be auto-accepted when the user clicks the email verification link.
   */
  async register(data: { name: string; email: string; password: string; inviteToken?: string }) {
    const emailLower = data.email.toLowerCase().trim()

    // 1. Check for duplicate email
    const existingUser = await authRepository.findByEmail(emailLower)
    if (existingUser) {
      throw new DuplicateError('Email already registered')
    }

    // 2. Hash password with cost factor 12
    const passwordHash = await bcrypt.hash(data.password, 12)

    // 3. Create user (Prisma generates the cuid automatically)
    const user = await authRepository.create({
      name: data.name,
      email: emailLower,
      passwordHash,
    })

    // 4. Generate verification token (32 random bytes)
    const verificationToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = hashToken(verificationToken)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    // 5. Store hashed verification token in DB
    await authRepository.createEmailVerificationToken({
      userId: user.id,
      tokenHash,
      expiresAt,
    })

    // 6. If user registered via an invite link, store the invite token in Redis
    //    so it can be auto-accepted after email verification (even in a new browser tab).
    if (data.inviteToken) {
      await storePendingInviteForVerification(tokenHash, data.inviteToken)
    }

    // 7. Queue verification email (scalable & resilient)
    await notifyQueue.add('VERIFICATION_EMAIL', {
      type: 'VERIFICATION_EMAIL',
      emailPayload: {
        to: user.email,
        name: user.name,
        verificationToken,
      },
    })

    // Return message indicating unverified state (no session tokens returned)
    return {
      message: 'Check your email to verify your account',
      email: user.email,
    }
  },

  /**
   * Log in a user, validating credentials and issuing session cookies/tokens.
   */
  async login(
    data: { email: string; password: string },
    req: Request,
    res: Response
  ) {
    const emailLower = data.email.toLowerCase().trim()

    // 1. Fetch user by email
    const user = await authRepository.findByEmail(emailLower)

    // 2. Handle invalid user (Timing Attack Prevention)
    if (!user) {
      await bcrypt.compare(data.password, BCRYPT_FAKE_HASH)
      throw new UnauthorizedError('INVALID_CREDENTIALS', 'Invalid email or password')
    }

    // 3. Brute force: Check account lockout status
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000)
      throw new RateLimitError(`Account locked. Try again in ${minutesLeft} minutes.`)
    }

    // 4. Check email verification
    if (!user.emailVerified) {
      throw new AppError('EMAIL_NOT_VERIFIED', 403, 'Please verify your email address')
    }

    // 5. Check if OAuth-only account (no password hash)
    if (!user.passwordHash) {
      throw new UnauthorizedError(
        'USE_OAUTH',
        'This account was created using Google/GitHub login. Please sign in using OAuth.'
      )
    }

    // 6. Validate password
    const passwordMatch = await bcrypt.compare(data.password, user.passwordHash)

    // 7. Handle wrong password
    if (!passwordMatch) {
      const newAttempts = user.failedLoginAttempts + 1
      const lockedUntil =
        newAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null // 15 min lock

      await authRepository.updateFailedAttempts(user.id, newAttempts, lockedUntil)
      throw new UnauthorizedError('INVALID_CREDENTIALS', 'Invalid email or password')
    }

    // 8. Successful login cleanup
    await authRepository.resetFailedAttempts(user.id)
    await authRepository.updateLastLogin(user.id)

    // 9. Generate access & refresh tokens
    const accessToken = generateAccessToken(user)
    const refreshToken = generateRefreshToken()

    // 10. Store hashed refresh token in DB
    await authRepository.createRefreshToken({
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
    })

    // 11. Set secure HTTP-only cookie
    res.cookie('rapto_refresh', refreshToken, COOKIE_OPTIONS)

    // 12. Return payload (omitting sensitive fields)
    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        teamId: user.teamId,
        team: toPublicTeam(user.team),
        onboardingCompleted: user.onboardingCompleted,
      },
    }
  },

  /**
   * Log out a user by clearing their cookie and deleting the session from the DB.
   */
  async logout(req: Request, res: Response) {
    const refreshToken = req.cookies.rapto_refresh

    if (refreshToken) {
      const tokenHash = hashToken(refreshToken)
      const storedToken = await authRepository.findRefreshToken(tokenHash)

      if (storedToken) {
        await authRepository.deleteRefreshToken(storedToken.id)
      }
    }

    // Clear client-side cookie — path MUST match the path used when setting it
    res.clearCookie('rapto_refresh', {
      httpOnly: COOKIE_OPTIONS.httpOnly,
      secure:   COOKIE_OPTIONS.secure,
      sameSite: COOKIE_OPTIONS.sameSite,
      path:     COOKIE_OPTIONS.path,
    })

    return { message: 'Logged out successfully' }
  },

  /**
   * Refresh the user's access token, rotating the refresh token.
   * Employs single-flight grace windows and token-rotation chaining
   * to guarantee that concurrent in-flight requests never falsely 401.
   */
  async refresh(req: Request, res: Response) {
    const rawRefreshToken = (req.cookies?.rapto_refresh || req.body?.refreshToken) as string | undefined
    if (!rawRefreshToken || typeof rawRefreshToken !== 'string' || !rawRefreshToken.trim()) {
      logger.warn({ ip: req.ip }, 'Refresh attempt with no cookie or body token')
      throw new UnauthorizedError('NO_REFRESH_TOKEN', 'No refresh token provided')
    }

    const refreshToken = rawRefreshToken.trim()
    const tokenHash = hashToken(refreshToken)
    const stored = await authRepository.findRefreshToken(tokenHash)

    if (!stored) {
      // Check Redis and in-memory grace cache for recently rotated token
      let rotatedData: RotatedTokenData | null = null

      try {
        const cached = await redis.get(`auth:rotated:${tokenHash}`)
        if (cached) {
          rotatedData = JSON.parse(cached) as RotatedTokenData
        }
      } catch (redisErr) {
        logger.warn({ err: redisErr }, 'Redis lookup failed for rotated token grace check')
      }

      if (!rotatedData) {
        cleanupInMemoryRotations()
        rotatedData = inMemoryRotatedTokens.get(tokenHash) || null
      }

      if (rotatedData) {
        // Follow rotation chain to find the latest active token if further rotations occurred
        let currentRotation = rotatedData
        let depth = 0
        while (depth < 5) {
          const nextHash = hashToken(currentRotation.refreshToken)
          let nextRotation: RotatedTokenData | null = null
          try {
            const nextCached = await redis.get(`auth:rotated:${nextHash}`)
            if (nextCached) nextRotation = JSON.parse(nextCached) as RotatedTokenData
          } catch {}
          if (!nextRotation) {
            nextRotation = inMemoryRotatedTokens.get(nextHash) || null
          }
          if (!nextRotation) break
          currentRotation = nextRotation
          depth++
        }

        res.cookie('rapto_refresh', currentRotation.refreshToken, COOKIE_OPTIONS)
        logger.info({ ip: req.ip }, 'Concurrent refresh request satisfied via rotation grace window')
        return { accessToken: currentRotation.accessToken }
      }

      logger.warn({ ip: req.ip }, 'Refresh attempt with unknown or revoked token hash')
      throw new UnauthorizedError('INVALID_REFRESH_TOKEN', 'Invalid refresh token')
    }

    // Apply a 30-second grace period to handle clock skew between client/server
    const CLOCK_SKEW_GRACE_MS = 30 * 1000
    if (stored.expiresAt < new Date(Date.now() - CLOCK_SKEW_GRACE_MS)) {
      await authRepository.deleteRefreshToken(stored.id)
      logger.warn({ userId: stored.userId, ip: req.ip }, 'Refresh token expired — session ended')
      throw new UnauthorizedError('REFRESH_TOKEN_EXPIRED', 'Refresh token has expired')
    }

    const user = await authRepository.findById(stored.userId)
    if (!user) {
      await authRepository.deleteRefreshToken(stored.id)
      logger.warn({ userId: stored.userId }, 'Refresh: user not found — deleting orphaned token')
      throw new UnauthorizedError('USER_NOT_FOUND', 'User not found')
    }

    // ROTATION — atomically delete old token and issue new one
    await authRepository.deleteRefreshToken(stored.id)

    const newAccessToken = generateAccessToken(user)
    const newRefreshToken = generateRefreshToken()

    await authRepository.createRefreshToken({
      userId: user.id,
      tokenHash: hashToken(newRefreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
    })

    const rotationRecord: RotatedTokenData = {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      userId: user.id,
      rotatedAt: Date.now(),
    }

    // Store rotated token mapping in Redis with 60s TTL to protect against concurrent in-flight requests
    try {
      await redis.set(
        `auth:rotated:${tokenHash}`,
        JSON.stringify(rotationRecord),
        'EX',
        60 // 60 seconds grace period
      )
    } catch (redisErr) {
      logger.warn({ err: redisErr }, 'Failed to cache rotated refresh token in Redis')
    }

    // Store in in-memory fallback cache as well
    inMemoryRotatedTokens.set(tokenHash, rotationRecord)
    cleanupInMemoryRotations()

    res.cookie('rapto_refresh', newRefreshToken, COOKIE_OPTIONS)

    logger.info({ userId: user.id, ip: req.ip }, 'Token refreshed and rotated successfully')

    // The user row is already loaded — returning it saves every client a
    // follow-up GET /auth/me round trip on session bootstrap.
    return { accessToken: newAccessToken, user: toPublicUser(user) }
  },

  /**
   * Verify a user's email verification token, update status, and perform auto-login.
   * If a pending invite token was stored during registration (Redis), it is
   * automatically accepted here — works even when the link opens in a new browser tab.
   */
  async verifyEmail(token: string, req: Request, res: Response) {
    if (!token) {
      throw new AppError('TOKEN_REQUIRED', 400, 'Verification token is required')
    }

    const tokenHash = hashToken(token)
    const stored = await authRepository.findEmailVerificationToken(tokenHash)

    if (!stored) {
      throw new AppError('TOKEN_INVALID', 400, 'Invalid verification token')
    }

    if (stored.expiresAt < new Date()) {
      await authRepository.deleteEmailVerificationToken(stored.id)
      throw new AppError('TOKEN_EXPIRED', 410, 'Verification token has expired')
    }

    const user = await authRepository.findById(stored.userId)
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 404, 'User not found')
    }

    // Consume pending invite token BEFORE we delete the verification record
    // (Redis key is based on the verification tokenHash, which we still have)
    const pendingInviteToken = await consumePendingInviteForVerification(tokenHash)

    // Mark user verified and delete token in a transaction
    await prisma.$transaction([
      prisma.user.update({
        where: { id: stored.userId },
        data: { emailVerified: true, emailVerifiedAt: new Date() },
      }),
      prisma.emailVerificationToken.delete({
        where: { id: stored.id },
      }),
    ])

    // Auto-accept invite if the user registered via an invite link.
    // We do this AFTER verification is committed so the user is a valid, verified account.
    if (pendingInviteToken) {
      await tryAcceptInvitation(stored.userId, pendingInviteToken)
    }

    // Re-fetch user to get updated teamId/role after potential invite acceptance
    const updatedUser = (await authRepository.findById(stored.userId)) ?? user

    // Generate tokens for auto-login
    const accessToken = generateAccessToken(updatedUser)
    const refreshToken = generateRefreshToken()

    await authRepository.createRefreshToken({
      userId: updatedUser.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
    })

    res.cookie('rapto_refresh', refreshToken, COOKIE_OPTIONS)

    return {
      accessToken,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        teamId: updatedUser.teamId,
        team: toPublicTeam(updatedUser.team),
        onboardingCompleted: updatedUser.onboardingCompleted,
      },
      message: 'Email verified successfully',
      // Inform frontend whether an invite was auto-accepted
      inviteAccepted: !!pendingInviteToken,
    }
  },

  /**
   * Resends the verification email for an unverified account.
   */
  async resendVerification(email: string) {
    const emailLower = email.toLowerCase().trim()
    const user = await authRepository.findByEmail(emailLower)

    // User enumeration protection
    const defaultResponse = { message: 'If that email exists and is unverified, a new verification link has been sent' }

    if (!user) {
      await bcrypt.compare('dummy_password', BCRYPT_FAKE_HASH)
      return defaultResponse
    }

    if (user.emailVerified) {
      return defaultResponse
    }

    // Delete existing tokens
    await authRepository.deleteEmailVerificationTokensByUserId(user.id)

    // Generate new token
    const verificationToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = hashToken(verificationToken)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    await authRepository.createEmailVerificationToken({
      userId: user.id,
      tokenHash,
      expiresAt,
    })

    // Queue verification email
    await notifyQueue.add('VERIFICATION_EMAIL', {
      type: 'VERIFICATION_EMAIL',
      emailPayload: {
        to: user.email,
        name: user.name,
        verificationToken,
      },
    })

    return defaultResponse
  },


  /**
   * Initiates forgot password flow (always 200).
   */
  async forgotPassword(email: string) {
    const emailLower = email.toLowerCase().trim()
    const user = await authRepository.findByEmail(emailLower)

    // User enumeration protection: always return same response
    const defaultResponse = { message: 'If that email exists, a reset link has been sent' }

    if (!user) {
      // Prevent timing attacks
      await bcrypt.compare('dummy_password', BCRYPT_FAKE_HASH)
      return defaultResponse
    }

    // Only send reset if email is verified
    if (!user.emailVerified) {
      return defaultResponse
    }

    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = hashToken(token)
    const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000) // 1 hour

    await authRepository.createPasswordResetToken({
      userId: user.id,
      tokenHash,
      expiresAt,
    })

    // Queue reset email (scalable & resilient)
    await notifyQueue.add('PASSWORD_RESET_EMAIL', {
      type: 'PASSWORD_RESET_EMAIL',
      emailPayload: {
        to: user.email,
        name: user.name,
        token,
      },
    })

    return defaultResponse
  },

  /**
   * Reset a user's password using reset token.
   */
  async resetPassword(data: { token: string; newPassword?: string }, req: Request, res: Response) {
    if (!data.token) {
      throw new AppError('TOKEN_REQUIRED', 400, 'Reset token is required')
    }
    if (!data.newPassword) {
      throw new AppError('PASSWORD_REQUIRED', 400, 'New password is required')
    }

    const tokenHash = hashToken(data.token)
    const stored = await authRepository.findPasswordResetToken(tokenHash)

    if (!stored || stored.usedAt) {
      throw new AppError('TOKEN_INVALID', 400, 'Invalid or already used reset token')
    }

    if (stored.expiresAt < new Date()) {
      throw new AppError('TOKEN_EXPIRED', 410, 'Reset token has expired')
    }

    const user = await authRepository.findById(stored.userId)
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 404, 'User not found')
    }

    // Verify they are not using the same password
    if (user.passwordHash) {
      const isSame = await bcrypt.compare(data.newPassword, user.passwordHash)
      if (isSame) {
        throw new AppError('PASSWORD_MUST_BE_DIFFERENT', 400, 'New password must be different from current password')
      }
    }

    const newHash = await bcrypt.hash(data.newPassword, 12)

    // Run updates in transaction: update user password, mark token used, and delete ALL active refresh tokens
    await prisma.$transaction([
      prisma.user.update({
        where: { id: stored.userId },
        data: { passwordHash: newHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      }),
      prisma.refreshToken.deleteMany({
        where: { userId: stored.userId },
      }),
    ])

    // Auto-login with a fresh session
    const accessToken = generateAccessToken(user)
    const refreshToken = generateRefreshToken()

    await authRepository.createRefreshToken({
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
    })

    res.cookie('rapto_refresh', refreshToken, COOKIE_OPTIONS)

    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        teamId: user.teamId,
        team: toPublicTeam(user.team),
        onboardingCompleted: user.onboardingCompleted,
      },
      message: 'Password reset successful',
    }
  },

  /**
   * Google OAuth Initiate.
   * Accepts an optional inviteToken query param (passed from frontend when user
   * clicks "Continue with Google" on /login or /register from an invite link).
   * The invite token is stored in Redis alongside the OAuth state so it can be
   * auto-accepted after successful OAuth — no redirects or extra steps required.
   */
  async googleInit(query: { inviteToken?: string }, res: Response) {
    const state = crypto.randomBytes(32).toString('hex')
    // Store state → '1' (or invite token if present) in Redis (TTL 10 min)
    await redis.set(`oauth:state:${state}`, '1', 'EX', 600)

    if (query.inviteToken) {
      await redis.set(`oauth:invite:${state}`, query.inviteToken, 'EX', 600)
    }

    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      redirect_uri: env.GOOGLE_REDIRECT_URI!,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'offline',
      prompt: 'consent',
    })

    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
  },

  /**
   * Google OAuth Callback.
   */
  async googleCallback(
    query: { code?: string; state?: string; error?: string },
    req: Request,
    res: Response
  ) {
    const frontendUrl = getFrontendUrl()

    if (query.state) {
      const calendarUserId = await redis.get(`oauth:state:calendar:${query.state}`)
      if (calendarUserId) {
        return authService.googleCalendarCallback(query, res, env.GOOGLE_REDIRECT_URI!)
      }
    }

    if (query.error === 'access_denied') {
      return res.redirect(`${frontendUrl}/login?error=oauth_denied`)
    }

    if (!query.state || !query.code) {
      return res.redirect(`${frontendUrl}/login?error=oauth_failed`)
    }

    // Verify state
    const storedState = await redis.get(`oauth:state:${query.state}`)
    if (!storedState) {
      return res.redirect(`${frontendUrl}/login?error=oauth_failed`)
    }
    // Delete state (one-time use)
    await redis.del(`oauth:state:${query.state}`)

    try {
      // Exchange code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: query.code,
          client_id: env.GOOGLE_CLIENT_ID!,
          client_secret: env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: env.GOOGLE_REDIRECT_URI!,
          grant_type: 'authorization_code',
        }),
      })

      if (!tokenResponse.ok) {
        throw new Error('Google token exchange failed')
      }

      const tokens = (await tokenResponse.json()) as any
      const idToken = tokens.id_token

      // Verify Google Token securely using Google's tokeninfo endpoint
      const tokenInfoResponse = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
      )
      if (!tokenInfoResponse.ok) {
        throw new Error('Google token verification failed')
      }

      const payload = (await tokenInfoResponse.json()) as any

      // Account linking logic (3 cases)
      let user = await authRepository.findUserByGoogleId(payload.sub)

      if (!user) {
        // Find by email
        user = await authRepository.findByEmail(payload.email)
        if (user) {
          // CASE 2: email exists, link Google
          user = (await authRepository.linkGoogleAccount(
            user.id,
            payload.sub,
            payload.picture
          )) as any
          // Fetch user details again to include team
          user = await authRepository.findById(user!.id)
        } else {
          // CASE 3: create new user
          const name = payload.name || payload.email.split('@')[0]
          user = (await prisma.user.create({
            data: {
              email: payload.email,
              name,
              googleId: payload.sub,
              emailVerified: true,
              emailVerifiedAt: new Date(),
              avatarUrl: payload.picture || null,
            },
            include: { team: true },
          })) as any
        }
      }

      // Check for pending invite token stored at OAuth initiation
      const pendingInviteToken = query.state
        ? await redis.get(`oauth:invite:${query.state}`)
        : null
      if (pendingInviteToken) {
        await redis.del(`oauth:invite:${query.state!}`)
      }

      // Auto-accept invite if user arrived via an invite link (works for both
      // new OAuth signups and existing users linking their Google account)
      if (pendingInviteToken && user) {
        await tryAcceptInvitation(user.id, pendingInviteToken)
        // Re-fetch user to get updated teamId after invite acceptance
        user = await authRepository.findById(user.id)
      }

      // Generate session tokens
      const accessToken = generateAccessToken(user!)
      const refreshToken = generateRefreshToken()

      await authRepository.createRefreshToken({
        userId: user!.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
      })

      res.cookie('rapto_refresh', refreshToken, COOKIE_OPTIONS)

      // Pass the accessToken as a URL parameter to the OAuth callback page.
      // The frontend /auth/callback page reads this param, stores it in the
      // Zustand memory store (accessToken), then immediately replaces the URL
      // to strip the token from history (standard OAuth BFF pattern).
      //
      // WHY NOT just redirect to /dashboard?
      //   A bare redirect sets the refresh cookie but leaves accessToken=null
      //   in the Zustand store. All API calls on page load fire before the
      //   app can do a /auth/refresh, so they all 401.
      const destination = user!.onboardingCompleted || user!.teamId
        ? `${frontendUrl}/auth/callback?token=${accessToken}&next=/dashboard`
        : `${frontendUrl}/auth/callback?token=${accessToken}&next=/onboarding`

      res.redirect(destination)
    } catch (error) {
      logger.error({ error }, 'Google OAuth callback handling failed')
      res.redirect(`${frontendUrl}/login?error=oauth_failed`)
    }
  },

  /**
   * Get authenticated user's profile.
   */
  async getMe(userId: string) {
    const user = await authRepository.findById(userId)
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 404, 'User not found')
    }

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        teamId: user.teamId,
        team: toPublicTeam(user.team),
        avatarUrl: user.avatarUrl,
        timezone: user.timezone,
        lastLoginAt: user.lastLoginAt,
        onboardingCompleted: user.onboardingCompleted,
      },
    }
  },

  /**
   * Update authenticated user's profile.
   */
  async updateMe(
    userId: string,
    data: { name?: string; timezone?: string; avatarUrl?: string | null; onboardingCompleted?: boolean }
  ) {
    // Completing onboarding is a one-way transition that triggers the welcome email.
    // Claim it atomically (WHERE onboardingCompleted = false) so a double submit,
    // a retry or a refresh on the completion screen can't send the email twice.
    let justCompleted = false
    const { onboardingCompleted, ...profile } = data
    if (onboardingCompleted === true) {
      const claimed = await prisma.user.updateMany({
        where: { id: userId, onboardingCompleted: false },
        data: { onboardingCompleted: true },
      })
      justCompleted = claimed.count === 1
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      // onboardingCompleted: false is still honoured; true was applied above
      data: onboardingCompleted === false ? { ...profile, onboardingCompleted } : profile,
      include: { team: { select: { id: true, name: true, slug: true, plan: true } } },
    })

    // Auto-trigger welcome email when onboarding completes (including skipped steps flow)
    if (justCompleted) {
      const workspaceName = updated.team?.name || `${updated.name}'s Workspace`
      const frontendUrl = getFrontendUrl()
      const dashboardUrl = `${frontendUrl}/dashboard`

      logger.info({ userId: updated.id, role: updated.role }, 'Onboarding completed — sending welcome email')

      if (updated.role === 'OWNER' || updated.role === 'ADMIN' || !updated.teamId) {
        // Direct immediate send (non-blocking)
        emailService
          .sendOwnerWelcomeEmail({
            to: updated.email,
            ownerName: updated.name,
            workspaceName,
            dashboardUrl,
            userId: updated.id,
          })
          .catch((err) => {
            logger.error({ err, userId: updated.id }, 'Direct sendOwnerWelcomeEmail failed')
          })

        // Also push to BullMQ queue for auditing/worker redundancy if active
        notifyQueue
          .add('EMAIL_OWNER_WELCOME', {
            type: 'EMAIL_OWNER_WELCOME',
            emailPayload: {
              to: updated.email,
              ownerName: updated.name,
              workspaceName,
              dashboardUrl,
              userId: updated.id,
            },
          })
          .catch(() => {})
      } else {
        // Direct immediate send (non-blocking)
        emailService
          .sendTeamMemberWelcomeEmail({
            to: updated.email,
            memberName: updated.name,
            workspaceName,
            inviterName: 'Your Workspace Administrator',
            role: updated.role,
            dashboardUrl,
            userId: updated.id,
          })
          .catch((err) => {
            logger.error({ err, userId: updated.id }, 'Direct sendTeamMemberWelcomeEmail failed')
          })

        // Also push to BullMQ queue for auditing/worker redundancy if active
        notifyQueue
          .add('EMAIL_TEAM_MEMBER_WELCOME', {
            type: 'EMAIL_TEAM_MEMBER_WELCOME',
            emailPayload: {
              to: updated.email,
              memberName: updated.name,
              workspaceName,
              inviterName: 'Your Workspace Administrator',
              role: updated.role,
              dashboardUrl,
              userId: updated.id,
            },
          })
          .catch(() => {})
      }
    }

    return {
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        teamId: updated.teamId,
        team: toPublicTeam(updated.team),
        avatarUrl: updated.avatarUrl,
        timezone: updated.timezone,
        lastLoginAt: updated.lastLoginAt,
        onboardingCompleted: updated.onboardingCompleted,
      },
    }
  },


  /**
   * Retrieve active refresh token sessions.
   */
  async getSessions(userId: string, currentToken: string) {
    const sessions = await authRepository.getSessionsByUserId(userId)
    const currentHash = hashToken(currentToken)

    return sessions.map((session) => ({
      id: session.id,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt || session.createdAt,
      isCurrent: session.tokenHash === currentHash,
    }))
  },

  /**
   * Google Calendar OAuth Initiate.
   */
  async googleCalendarInit(userId: string, req: Request, res: Response) {
    const state = crypto.randomBytes(32).toString('hex')
    const context = req.query?.context === 'onboarding' ? 'onboarding' : 'settings'
    const redisValue = JSON.stringify({ userId, context, provider: 'GOOGLE_CALENDAR' })
    // Store in Redis (TTL 10 min) linking state to the user ID
    await redis.set(`oauth:state:calendar:${state}`, redisValue, 'EX', 600)

    // Use a dedicated calendar redirect URI if configured, otherwise fall back
    // to the generic Google redirect URI. The same URI MUST be used in both
    // googleCalendarInit and googleCalendarCallback — a mismatch causes Google
    // to reject the token exchange with a 400 redirect_uri_mismatch error.
    const calendarRedirectUri =
      env.GOOGLE_CALENDAR_REDIRECT_URI ||
      env.GOOGLE_CALENDAR_CALLBACK_URL ||
      `${env.API_URL || 'http://localhost:5000'}/api/v1/auth/google-calendar/callback`

    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      redirect_uri: calendarRedirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar.readonly',
      state,
      access_type: 'offline',
      prompt: 'consent',
    })

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`

    logger.info(
      { clientId: env.GOOGLE_CLIENT_ID, redirectUri: calendarRedirectUri },
      'googleCalendarInit: generated authorization URL'
    )

    if (req.headers.accept?.includes('application/json') || req.xhr || req.query?.format === 'json') {
      return res.status(200).json({ success: true, data: { authUrl } })
    }

    res.redirect(authUrl)
  },

  /**
   * Google Calendar OAuth Callback.
   */
  async googleCalendarCallback(
    query: { code?: string; state?: string; error?: string },
    res: Response,
    redirectUri?: string
  ) {
    const frontendUrl = getFrontendUrl()

    if (query.error === 'access_denied') {
      return res.redirect(`${frontendUrl}/onboarding/connect-calendar?error=oauth_denied`)
    }

    if (!query.state || !query.code) {
      return res.redirect(`${frontendUrl}/onboarding/connect-calendar?error=oauth_failed`)
    }

    // Verify state
    const storedState = await redis.get(`oauth:state:calendar:${query.state}`)
    if (!storedState) {
      return res.redirect(`${frontendUrl}/onboarding/connect-calendar?error=state_mismatch`)
    }
    // Delete state (one-time use)
    await redis.del(`oauth:state:calendar:${query.state}`)

    let userId = storedState
    let context = 'settings'
    try {
      const parsed = JSON.parse(storedState)
      if (parsed.userId) userId = parsed.userId
      if (parsed.context) context = parsed.context
    } catch (_) {}

    try {
      // MUST match the redirect_uri used in googleCalendarInit exactly.
      const activeRedirectUri =
        env.GOOGLE_CALENDAR_REDIRECT_URI ||
        env.GOOGLE_CALENDAR_CALLBACK_URL ||
        redirectUri ||
        `${env.API_URL || 'http://localhost:5000'}/api/v1/auth/google-calendar/callback`

      // Exchange code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: query.code,
          client_id: env.GOOGLE_CLIENT_ID!,
          client_secret: env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: activeRedirectUri,
          grant_type: 'authorization_code',
        }),
      })

      if (!tokenResponse.ok) {
        const body = await tokenResponse.text()
        throw new Error(`Google token exchange failed: ${tokenResponse.status} ${body}`)
      }

      const tokens = (await tokenResponse.json()) as any
      const { access_token, refresh_token, expires_in } = tokens

      if (!access_token) {
        throw new Error('No access token returned from Google')
      }

      // Encrypt sensitive tokens using crypto utility
      const accessTokenEnc = encrypt(access_token)
      const refreshTokenEnc = refresh_token ? encrypt(refresh_token) : null
      const tokenExpiresAt = new Date(Date.now() + (expires_in || 3600) * 1000)

      // Disable other calendar providers to enforce single-active calendar provider rule
      await prisma.userIntegration.updateMany({
        where: {
          userId,
          provider: { not: 'GOOGLE_CALENDAR' },
          syncEnabled: true,
        },
        data: { syncEnabled: false },
      })

      // Store / Update user integration in database
      await prisma.userIntegration.upsert({
        where: {
          userId_provider: {
            userId,
            provider: 'GOOGLE_CALENDAR',
          },
        },
        create: {
          userId,
          provider: 'GOOGLE_CALENDAR',
          accessTokenEnc,
          refreshTokenEnc,
          tokenExpiresAt,
          calendarId: 'primary',
          syncEnabled: true,
        },
        update: {
          accessTokenEnc,
          ...(refreshTokenEnc && { refreshTokenEnc }),
          tokenExpiresAt,
          syncEnabled: true,
          consecutiveErrors: 0,
          lastError: null,
        },
      })

      // Trigger immediate initial calendar sync
      try {
        const { calendarSyncQueue } = await import('../../queues/queue.client')
        await calendarSyncQueue.add('sync-user-calendar', { userId })
      } catch (queueErr: any) {
        logger.warn({ userId, err: queueErr?.message }, 'Failed to enqueue initial calendar sync job')
      }

      const redirectUrl = context === 'onboarding'
        ? `${frontendUrl}/onboarding/connect-calendar?connected=true`
        : `${frontendUrl}/settings/integrations?connected=GOOGLE_CALENDAR`

      res.redirect(redirectUrl)
    } catch (error: any) {
      // Log the full error so it is never serialized as an empty {}
      logger.error(
        { error: error?.message, stack: error?.stack, userId },
        'Google Calendar OAuth callback handling failed'
      )
      let user = null
      if (userId) {
        try {
          user = await prisma.user.findUnique({
            where: { id: userId },
            select: { onboardingCompleted: true }
          })
        } catch (_) {}
      }
      const errorRedirect = user?.onboardingCompleted
        ? `${frontendUrl}/settings/integrations?error=oauth_failed`
        : `${frontendUrl}/onboarding/connect-calendar?error=oauth_failed`
      res.redirect(errorRedirect)
    }
  },

  /**
   * Change authenticated user's password.
   */
  async changePassword(
    userId: string,
    data: { currentPassword: string; newPassword: string },
    currentToken: string
  ) {
    const user = await authRepository.findById(userId)
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 404, 'User not found')
    }

    if (!user.passwordHash) {
      throw new AppError(
        'USE_OAUTH_ACCOUNT',
        400,
        'This account was created using Google login. You cannot set a password directly.'
      )
    }

    const matches = await bcrypt.compare(data.currentPassword, user.passwordHash)
    if (!matches) {
      throw new AppError('INVALID_CURRENT_PASSWORD', 400, 'Invalid current password')
    }

    const isSame = await bcrypt.compare(data.newPassword, user.passwordHash)
    if (isSame) {
      throw new AppError('PASSWORD_MUST_BE_DIFFERENT', 400, 'New password must be different from current password')
    }

    const newHash = await bcrypt.hash(data.newPassword, 12)
    const currentHash = hashToken(currentToken)

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newHash },
      }),
      prisma.refreshToken.deleteMany({
        where: {
          userId,
          NOT: {
            tokenHash: currentHash,
          },
        },
      }),
    ])

    return { message: 'Password updated successfully' }
  },

  /**
   * Revoke a refresh token session (remote logout).
   */
  async revokeSession(userId: string, sessionId: string) {
    const session = await prisma.refreshToken.findUnique({
      where: { id: sessionId },
    })

    if (!session) {
      throw new AppError('SESSION_NOT_FOUND', 404, 'Session not found')
    }

    if (session.userId !== userId) {
      throw new ForbiddenError('You do not have permission to revoke this session')
    }

    await authRepository.deleteRefreshToken(sessionId)

    return { message: 'Session revoked successfully' }
  },
}

