import { asyncHandler } from '../../../utils/async-handler'
import { success } from '../../../utils/response'
import { adminAuthService } from './admin-auth.service'
import { env } from '../../../config/env'

const REFRESH_COOKIE_NAME = 'rapto_admin_refresh_direct' // used only by direct API consumers
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: (env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
  domain: env.COOKIE_DOMAIN, // e.g. ".rapto.cloud" in production
  path: '/api/v1/admin/auth/refresh',
  maxAge: 30 * 24 * 60 * 60 * 1000,
}

export const login = asyncHandler(async (req, res) => {
  const result = await adminAuthService.login(req.body.email, req.body.password, req.ip)
  res.status(200).json(success(result))
})

export const verifyMfaSetup = asyncHandler(async (req, res) => {
  const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined
  const result = await adminAuthService.verifyMfaSetup(
    req.body.challengeToken,
    req.body.code,
    req.ip,
    userAgent
  )
  if (result.refreshToken) {
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTIONS)
  }
  res.status(200).json(success(result))
})

export const verifyMfaChallenge = asyncHandler(async (req, res) => {
  const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined
  const result = await adminAuthService.verifyMfaChallenge(
    req.body.challengeToken,
    req.body.code,
    req.ip,
    userAgent
  )
  if (result.refreshToken) {
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTIONS)
  }
  res.status(200).json(success(result))
})

export const refresh = asyncHandler(async (req, res) => {
  // Accepts token from EITHER the direct cookie OR request body (BFF proxy sends it in the body)
  const token = req.body.refreshToken ?? req.cookies?.[REFRESH_COOKIE_NAME]
  if (!token) {
    return res.status(401).json({
      success: false,
      error: { code: 'NO_REFRESH_TOKEN', message: 'No session found.' },
    })
  }

  const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined
  const result = await adminAuthService.refresh(token, req.ip, userAgent)
  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTIONS)
  res.status(200).json(success(result))
})

export const logout = asyncHandler(async (req, res) => {
  const token = req.body.refreshToken ?? req.cookies?.[REFRESH_COOKIE_NAME]
  await adminAuthService.logout(token, req.adminUser!.id)
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_OPTIONS.path })
  res.status(200).json(success({ message: 'Logged out successfully' }))
})

export const me = asyncHandler(async (req, res) => {
  res.status(200).json(success({ adminUser: req.adminUser }))
})
