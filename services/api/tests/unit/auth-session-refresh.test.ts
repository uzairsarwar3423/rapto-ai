// ─────────────────────────────────────────────────────────────────────────────
// auth-session-refresh.test.ts — Automated Unit/Integration Suite for Auth Refresh
// ─────────────────────────────────────────────────────────────────────────────

jest.mock('../../src/queues/queue.client', () => ({
  notifyQueue: {
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  },
  extractQueue: { add: jest.fn() },
  transcribeQueue: { add: jest.fn() },
  calendarSyncQueue: { add: jest.fn() },
  resolveQueue: { add: jest.fn() },
  tokenRefreshQueue: { add: jest.fn() },
  billingWebhookQueue: { add: jest.fn() },
  queues: [],
}))

import { authService } from '../../src/modules/auth/auth.service'
import { authRepository } from '../../src/modules/auth/auth.repository'
import { hashToken, generateRefreshToken } from '../../src/modules/auth/auth.helpers'
import { prisma } from '../../src/db/client'
import { redis } from '../../src/config/redis'
import { UnauthorizedError } from '../../src/utils/errors'
import type { Request, Response } from 'express'

describe('Auth Service — Refresh Token Rotation & Session Lifecycle', () => {
  let testUserId: string

  beforeAll(async () => {
    // Create test user directly in DB
    const uniqueEmail = `test.refresh.${Date.now()}.${Math.random().toString(36).substring(2, 7)}@rapto.dev`
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail,
        name: 'Test Refresh User',
        passwordHash: '$2b$12$LpyP0uH6O/5j1Z2/V271uO1bHqT9Doz7mFj2.N8F3H5y7kL.Z.fNu',
        emailVerified: true,
      },
    })
    testUserId = user.id
  })

  afterAll(async () => {
    if (testUserId) {
      await prisma.refreshToken.deleteMany({ where: { userId: testUserId } }).catch(() => {})
      await prisma.user.delete({ where: { id: testUserId } }).catch(() => {})
    }
    await prisma.$disconnect().catch(() => {})
    await redis.quit().catch(() => {})
  })

  beforeEach(async () => {
    if (testUserId) {
      await prisma.refreshToken.deleteMany({ where: { userId: testUserId } }).catch(() => {})
    }
  })

  function createMockReqRes(refreshTokenCookie?: string, bodyToken?: string) {
    const cookies: Record<string, string> = {}
    if (refreshTokenCookie) {
      cookies.rapto_refresh = refreshTokenCookie
    }

    const req = {
      cookies,
      body: bodyToken ? { refreshToken: bodyToken } : {},
      ip: '127.0.0.1',
      headers: { 'user-agent': 'Jest-Test-Runner/1.0' },
    } as unknown as Request

    let setCookieCall: { name: string; val: string; options: any } | null = null
    const res = {
      cookie: jest.fn((name: string, val: string, options: any) => {
        setCookieCall = { name, val, options }
      }),
    } as unknown as Response

    return { req, res, getCookie: () => setCookieCall }
  }

  describe('Valid Refresh Flow', () => {
    it('successfully rotates refresh token and returns new access token', async () => {
      const rawToken = generateRefreshToken()
      await authRepository.createRefreshToken({
        userId: testUserId,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        ipAddress: '127.0.0.1',
        userAgent: 'Jest-Test-Runner/1.0',
      })

      const { req, res } = createMockReqRes(rawToken)
      const result = await authService.refresh(req, res)

      expect(result).toHaveProperty('accessToken')
      expect(typeof result.accessToken).toBe('string')
      expect(res.cookie).toHaveBeenCalledWith(
        'rapto_refresh',
        expect.any(String),
        expect.objectContaining({ httpOnly: true, path: '/' })
      )

      // Old token should be deleted from DB
      const oldStored = await authRepository.findRefreshToken(hashToken(rawToken))
      expect(oldStored).toBeNull()
    })
  })

  describe('Missing & Invalid Tokens', () => {
    it('throws NO_REFRESH_TOKEN if no cookie or body is provided', async () => {
      const { req, res } = createMockReqRes()
      await expect(authService.refresh(req, res)).rejects.toThrow(UnauthorizedError)
      await expect(authService.refresh(req, res)).rejects.toMatchObject({
        code: 'NO_REFRESH_TOKEN',
      })
    })

    it('throws INVALID_REFRESH_TOKEN if token does not exist in DB or grace cache', async () => {
      const unknownToken = generateRefreshToken()
      const { req, res } = createMockReqRes(unknownToken)
      await expect(authService.refresh(req, res)).rejects.toThrow(UnauthorizedError)
      await expect(authService.refresh(req, res)).rejects.toMatchObject({
        code: 'INVALID_REFRESH_TOKEN',
      })
    })

    it('throws REFRESH_TOKEN_EXPIRED and deletes token if expired', async () => {
      const expiredRawToken = generateRefreshToken()
      await authRepository.createRefreshToken({
        userId: testUserId,
        tokenHash: hashToken(expiredRawToken),
        expiresAt: new Date(Date.now() - 60 * 1000), // 1 minute in the past
        ipAddress: '127.0.0.1',
        userAgent: 'Jest-Test-Runner/1.0',
      })

      const { req, res } = createMockReqRes(expiredRawToken)
      await expect(authService.refresh(req, res)).rejects.toThrow(UnauthorizedError)
      await expect(authService.refresh(req, res)).rejects.toMatchObject({
        code: 'REFRESH_TOKEN_EXPIRED',
      })

      // Must be cleaned up from DB
      const checkStored = await authRepository.findRefreshToken(hashToken(expiredRawToken))
      expect(checkStored).toBeNull()
    })
  })

  describe('Concurrent Refresh & Rotation Grace Window', () => {
    it('satisfies a duplicate request using the rotated token within the grace window', async () => {
      const tokenA = generateRefreshToken()
      await authRepository.createRefreshToken({
        userId: testUserId,
        tokenHash: hashToken(tokenA),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        ipAddress: '127.0.0.1',
        userAgent: 'Jest-Test-Runner/1.0',
      })

      // Request 1: rotates tokenA -> tokenB
      const mock1 = createMockReqRes(tokenA)
      const result1 = await authService.refresh(mock1.req, mock1.res)
      expect(result1.accessToken).toBeDefined()

      // Request 2: concurrent request arrives with tokenA (simulating another tab or in-flight request)
      const mock2 = createMockReqRes(tokenA)
      const result2 = await authService.refresh(mock2.req, mock2.res)
      expect(result2.accessToken).toBeDefined()
      expect(mock2.res.cookie).toHaveBeenCalledWith(
        'rapto_refresh',
        expect.any(String),
        expect.objectContaining({ httpOnly: true })
      )
    })

    it('follows multi-step rotation chaining if a token is rotated multiple times within grace window', async () => {
      const tokenA = generateRefreshToken()
      await authRepository.createRefreshToken({
        userId: testUserId,
        tokenHash: hashToken(tokenA),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        ipAddress: '127.0.0.1',
        userAgent: 'Jest-Test-Runner/1.0',
      })

      // 1. Rotate tokenA -> tokenB
      const mock1 = createMockReqRes(tokenA)
      await authService.refresh(mock1.req, mock1.res)
      const tokenB = (mock1.res.cookie as jest.Mock).mock.calls[0][1]

      // 2. Rotate tokenB -> tokenC
      const mock2 = createMockReqRes(tokenB)
      const result2 = await authService.refresh(mock2.req, mock2.res)
      const tokenC = (mock2.res.cookie as jest.Mock).mock.calls[0][1]

      // 3. Request with stale tokenA should resolve along the chain to active session
      const mockStale = createMockReqRes(tokenA)
      const resultStale = await authService.refresh(mockStale.req, mockStale.res)

      expect(resultStale.accessToken).toBeDefined()
      expect(mockStale.res.cookie).toHaveBeenCalledWith(
        'rapto_refresh',
        tokenC,
        expect.objectContaining({ httpOnly: true })
      )
    })
  })
})
