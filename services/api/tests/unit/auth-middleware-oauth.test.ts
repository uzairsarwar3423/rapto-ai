import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { requireAuth } from '../../src/middleware/auth.middleware'
import { env } from '../../src/config/env'
import { UnauthorizedError } from '../../src/utils/errors'
import { connectCalendarController } from '../../src/modules/integrations/integrations.controller'

jest.mock('../../src/config/redis', () => ({
  redis: {
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
  },
}))

jest.mock('../../src/modules/integrations/providers/calendar-provider.registry', () => ({
  calendarProviderRegistry: {
    getProvider: jest.fn().mockReturnValue({
      getAuthorizationUrl: jest.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?mock=true'),
    }),
  },
}))

describe('Auth Middleware — Multi-channel Token Extraction & Calendar Connect', () => {
  const validPayload = {
    sub: 'cmte5dc2i0008p907wbk0ysc8',
    teamId: 'cmtgr1gi3000cl308adp45rdh',
    role: 'OWNER',
    email: 'uzairsarwar542@gmail.com',
  }

  const validToken = jwt.sign(validPayload, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    issuer: 'rapto.cloud',
    audience: 'rapto-api',
    expiresIn: '15m',
  })

  const expiredToken = jwt.sign(validPayload, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    issuer: 'rapto.cloud',
    audience: 'rapto-api',
    expiresIn: '-1s',
  })

  const createMockReq = (overrides: Partial<Request> = {}): Request => {
    return {
      headers: {},
      query: {},
      cookies: {},
      path: '/api/v1/integrations/google-calendar/connect',
      ...overrides,
    } as unknown as Request
  }

  const createMockRes = (): Response => {
    const res: Partial<Response> = {}
    res.status = jest.fn().mockReturnValue(res)
    res.json = jest.fn().mockReturnValue(res)
    res.redirect = jest.fn().mockReturnValue(res)
    return res as Response
  }

  describe('requireAuth Middleware', () => {
    it('authenticates via Authorization: Bearer header', async () => {
      const req = createMockReq({
        headers: { authorization: `Bearer ${validToken}` },
      })
      const res = createMockRes()
      const next = jest.fn()

      await requireAuth(req, res, next)

      expect(next).toHaveBeenCalledWith()
      expect(req.user).toEqual({
        id: validPayload.sub,
        teamId: validPayload.teamId,
        role: validPayload.role,
        email: validPayload.email,
      })
    })

    it('authenticates via ?token= query parameter (browser navigation fallback)', async () => {
      const req = createMockReq({
        query: { token: validToken },
      })
      const res = createMockRes()
      const next = jest.fn()

      await requireAuth(req, res, next)

      expect(next).toHaveBeenCalledWith()
      expect(req.user).toEqual({
        id: validPayload.sub,
        teamId: validPayload.teamId,
        role: validPayload.role,
        email: validPayload.email,
      })
    })

    it('authenticates via ?access_token= query parameter', async () => {
      const req = createMockReq({
        query: { access_token: validToken },
      })
      const res = createMockRes()
      const next = jest.fn()

      await requireAuth(req, res, next)

      expect(next).toHaveBeenCalledWith()
      expect(req.user?.id).toBe(validPayload.sub)
    })

    it('authenticates via cookie rapto_access', async () => {
      const req = createMockReq({
        cookies: { rapto_access: validToken },
      })
      const res = createMockRes()
      const next = jest.fn()

      await requireAuth(req, res, next)

      expect(next).toHaveBeenCalledWith()
      expect(req.user?.id).toBe(validPayload.sub)
    })

    it('throws AUTH_REQUIRED UnauthorizedError when no token is present', async () => {
      const req = createMockReq()
      const res = createMockRes()
      const next = jest.fn()

      await requireAuth(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError))
      const err = next.mock.calls[0][0]
      expect(err.code).toBe('AUTH_REQUIRED')
      expect(err.message).toBe('Authentication required')
    })

    it('throws TOKEN_INVALID UnauthorizedError for tampered token', async () => {
      const req = createMockReq({
        query: { token: 'invalid.token.here' },
      })
      const res = createMockRes()
      const next = jest.fn()

      await requireAuth(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError))
      const err = next.mock.calls[0][0]
      expect(err.code).toBe('TOKEN_INVALID')
    })

    it('throws TOKEN_EXPIRED UnauthorizedError for expired token', async () => {
      const req = createMockReq({
        query: { token: expiredToken },
      })
      const res = createMockRes()
      const next = jest.fn()

      await requireAuth(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError))
      const err = next.mock.calls[0][0]
      expect(err.code).toBe('TOKEN_EXPIRED')
    })
  })

  describe('connectCalendarController Dual-Mode Responses', () => {
    it('returns JSON authUrl when Accept: application/json header is present', async () => {
      const req = createMockReq({
        headers: { accept: 'application/json, text/plain, */*' },
        user: { id: validPayload.sub } as any,
        path: '/api/v1/integrations/google-calendar/connect',
      })
      const res = createMockRes()
      const next = jest.fn()

      await connectCalendarController(req, res, next)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?mock=true' },
      })
      expect(res.redirect).not.toHaveBeenCalled()
    })

    it('redirects directly when browser performs standard navigation', async () => {
      const req = createMockReq({
        headers: { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9' },
        user: { id: validPayload.sub } as any,
        path: '/api/v1/integrations/google-calendar/connect',
      })
      const res = createMockRes()
      const next = jest.fn()

      await connectCalendarController(req, res, next)

      expect(res.redirect).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?mock=true')
      expect(res.json).not.toHaveBeenCalled()
    })
  })
})
