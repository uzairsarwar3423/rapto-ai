import { authenticator } from 'otplib'
import QRCode from 'qrcode'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { addDays } from 'date-fns'
import { adminAuthRepository as repo } from './admin-auth.repository'
import { auditLogService } from '../audit/audit-log.service'
import { encrypt, decrypt } from '../../../utils/crypto'
import { redis } from '../../../config/redis'
import { env } from '../../../config/env'
import { AppError, UnauthorizedError } from '../../../utils/errors'
import type { AdminJwtPayload, ChallengeTokenPayload, LoginResult } from './admin-auth.types'

const ADMIN_JWT_SECRET = env.ADMIN_JWT_SECRET
const CHALLENGE_JWT_SECRET = env.ADMIN_CHALLENGE_JWT_SECRET
const FAKE_HASH = '$2b$12$abcdefghijklmnopqrstuv.abcdefghijklmnopqrstuvwxyzABCDE' // constant for timing parity

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function signAccessToken(adminUserId: string, role: string): string {
  const payload: Omit<AdminJwtPayload, 'iat' | 'exp'> = {
    sub: adminUserId,
    role: role as AdminJwtPayload['role'],
    mfaVerified: true,
    iss: 'rapto.cloud',
    aud: 'rapto-admin',
  }
  return jwt.sign(payload, ADMIN_JWT_SECRET, { expiresIn: '15m', algorithm: 'HS256' })
}

function signChallengeToken(adminUserId: string, purpose: ChallengeTokenPayload['purpose']): string {
  const payload: Omit<ChallengeTokenPayload, 'iat' | 'exp'> = {
    sub: adminUserId,
    purpose,
    iss: 'rapto.cloud',
    aud: 'rapto-admin-challenge',
  }
  return jwt.sign(payload, CHALLENGE_JWT_SECRET, { expiresIn: '5m', algorithm: 'HS256' })
}

function verifyChallengeToken(token: string, expectedPurpose: ChallengeTokenPayload['purpose']): string {
  let payload: ChallengeTokenPayload
  try {
    payload = jwt.verify(token, CHALLENGE_JWT_SECRET, {
      audience: 'rapto-admin-challenge',
      issuer: 'rapto.cloud',
      algorithms: ['HS256'],
    }) as ChallengeTokenPayload
  } catch {
    throw new UnauthorizedError('CHALLENGE_EXPIRED', 'This verification step has expired. Please log in again.')
  }
  if (payload.purpose !== expectedPurpose) {
    throw new UnauthorizedError('CHALLENGE_PURPOSE_MISMATCH', 'Invalid verification step.')
  }
  return payload.sub // adminUserId
}

async function issueSessionTokens(adminUserId: string, role: string, ip?: string, userAgent?: string) {
  const accessToken = signAccessToken(adminUserId, role)

  const rawRefreshToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = sha256(rawRefreshToken)
  await repo.createRefreshToken({
    adminUserId,
    tokenHash,
    expiresAt: addDays(new Date(), 30),
    ipAddress: ip,
    userAgent,
  })

  return { accessToken, refreshToken: rawRefreshToken }
}

export const adminAuthService = {
  async login(email: string, password: string, ip?: string): Promise<LoginResult> {
    const lockKey = `lock:admin-login:${sha256(email)}`
    if (await redis.exists(lockKey)) {
      throw new AppError('ACCOUNT_LOCKED', 429, 'Too many failed attempts. Try again in 15 minutes.')
    }

    const admin = await repo.findByEmail(email)

    if (!admin) {
      await bcrypt.compare(password, FAKE_HASH) // timing-attack parity — always do the work
      throw new UnauthorizedError('INVALID_CREDENTIALS', 'Invalid email or password.')
    }

    if (admin.disabledAt) {
      // Never reveal WHY — "invalid credentials" and "disabled account" must look identical externally
      throw new UnauthorizedError('INVALID_CREDENTIALS', 'Invalid email or password.')
    }

    const passwordOk = await bcrypt.compare(password, admin.passwordHash)
    if (!passwordOk) {
      const attemptsKey = `ratelimit:admin-login:${sha256(email)}`
      const attempts = await redis.incr(attemptsKey)
      await redis.expire(attemptsKey, 900) // 15 min window
      if (attempts >= 5) {
        await redis.setex(lockKey, 900, '1')
      }
      await auditLogService.write(null, 'auth.login_failed', { email, ip })
      throw new UnauthorizedError('INVALID_CREDENTIALS', 'Invalid email or password.')
    }

    // Password correct from here on — reset the failed-attempt counter
    await redis.del(`ratelimit:admin-login:${sha256(email)}`)
    await auditLogService.write(admin.id, 'auth.login_password_ok', { email, ip })

    if (!admin.mfaEnabled) {
      const secret = authenticator.generateSecret()
      const encryptedSecret = encrypt(secret)
      await repo.setPendingTotpSecret(admin.id, encryptedSecret)

      const otpauthUrl = authenticator.keyuri(admin.email, 'Rapto Growth', secret)
      const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl)
      const challengeToken = signChallengeToken(admin.id, 'mfa-setup')

      return { requiresMfaSetup: true, qrCodeDataUrl, challengeToken }
    }

    const challengeToken = signChallengeToken(admin.id, 'mfa-challenge')
    return { requiresMfaChallenge: true, challengeToken }
  },

  async verifyMfaSetup(challengeToken: string, code: string, ip?: string, userAgent?: string): Promise<LoginResult> {
    const adminUserId = verifyChallengeToken(challengeToken, 'mfa-setup')
    const admin = await repo.findById(adminUserId)
    if (!admin?.totpSecretEnc) {
      throw new AppError('MFA_SETUP_NOT_STARTED', 400, 'No pending MFA setup found. Please log in again.')
    }

    const secret = decrypt(admin.totpSecretEnc)
    const isValid = authenticator.verify({ token: code, secret })
    if (!isValid) {
      await auditLogService.write(adminUserId, 'auth.mfa_setup_failed', { ip })
      throw new UnauthorizedError('INVALID_MFA_CODE', 'Incorrect code. Check your authenticator app and try again.')
    }

    await repo.enableMfa(adminUserId, admin.totpSecretEnc)
    await repo.updateLastLogin(adminUserId)
    await auditLogService.write(adminUserId, 'auth.mfa_enabled', { ip })

    const { accessToken, refreshToken } = await issueSessionTokens(adminUserId, admin.role, ip, userAgent)
    return {
      accessToken,
      refreshToken,
      adminUser: { id: admin.id, name: admin.name, email: admin.email, role: admin.role as any },
    }
  },

  async verifyMfaChallenge(challengeToken: string, code: string, ip?: string, userAgent?: string): Promise<LoginResult> {
    const adminUserId = verifyChallengeToken(challengeToken, 'mfa-challenge')
    const admin = await repo.findById(adminUserId)
    if (!admin?.totpSecretEnc) {
      throw new AppError('MFA_NOT_CONFIGURED', 400, 'MFA is not configured for this account.')
    }

    const mfaFailKey = `ratelimit:admin-mfa:${adminUserId}`
    const mfaLockKey = `lock:admin-mfa:${adminUserId}`
    if (await redis.exists(mfaLockKey)) {
      throw new AppError('ACCOUNT_LOCKED', 429, 'Too many failed codes. Try again in 15 minutes.')
    }

    const secret = decrypt(admin.totpSecretEnc)
    const isValid = authenticator.verify({ token: code, secret })
    if (!isValid) {
      const attempts = await redis.incr(mfaFailKey)
      await redis.expire(mfaFailKey, 900)
      if (attempts >= 5) await redis.setex(mfaLockKey, 900, '1')
      await auditLogService.write(adminUserId, 'auth.mfa_challenge_failed', { ip })
      throw new UnauthorizedError('INVALID_MFA_CODE', 'Incorrect code. Please try again.')
    }

    await redis.del(mfaFailKey)
    await repo.updateLastLogin(adminUserId)
    await auditLogService.write(adminUserId, 'auth.login_success', { ip })

    const { accessToken, refreshToken } = await issueSessionTokens(adminUserId, admin.role, ip, userAgent)
    return {
      accessToken,
      refreshToken,
      adminUser: { id: admin.id, name: admin.name, email: admin.email, role: admin.role as any },
    }
  },

  async refresh(rawRefreshToken: string, ip?: string, userAgent?: string) {
    const tokenHash = sha256(rawRefreshToken)
    const stored = await repo.findRefreshTokenByHash(tokenHash)
    if (!stored) {
      // Check Redis rotation grace window (60s TTL) to satisfy concurrent in-flight requests
      try {
        const cached = await redis.get(`admin:rotated:${tokenHash}`)
        if (cached) {
          return JSON.parse(cached) as LoginResult
        }
      } catch {}

      throw new UnauthorizedError('INVALID_REFRESH_TOKEN', 'Session expired. Please log in again.')
    }
    if (stored.expiresAt < new Date()) {
      await repo.deleteRefreshToken(stored.id)
      throw new UnauthorizedError('REFRESH_TOKEN_EXPIRED', 'Session expired. Please log in again.')
    }

    const admin = await repo.findById(stored.adminUserId)
    if (!admin || admin.disabledAt) {
      throw new UnauthorizedError('INVALID_REFRESH_TOKEN', 'Session expired. Please log in again.')
    }

    // Rotation: delete old, issue new — theft-detection parity with customer-facing flow
    await repo.deleteRefreshToken(stored.id)
    const { accessToken, refreshToken } = await issueSessionTokens(admin.id, admin.role, ip, userAgent)

    const result: LoginResult = {
      accessToken,
      refreshToken,
      adminUser: { id: admin.id, name: admin.name, email: admin.email, role: admin.role as any },
    }

    // Cache rotation in Redis for 60 seconds to satisfy concurrent in-flight requests gracefully
    try {
      await redis.set(`admin:rotated:${tokenHash}`, JSON.stringify(result), 'EX', 60)
    } catch {}

    return result
  },

  async logout(rawRefreshToken: string | undefined, adminUserId: string) {
    if (rawRefreshToken) {
      const stored = await repo.findRefreshTokenByHash(sha256(rawRefreshToken))
      if (stored) await repo.deleteRefreshToken(stored.id)
    }
    await auditLogService.write(adminUserId, 'auth.logout', {})
  },
}
