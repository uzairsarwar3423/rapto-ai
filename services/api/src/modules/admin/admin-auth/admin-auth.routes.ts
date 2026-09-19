import { Router } from 'express'
import { validate } from '../../../middleware/validate.middleware'
import { adminAuthMiddleware } from '../../../middleware/admin-auth.middleware'
import { loginRateLimiter } from '../../../middleware/rate-limit.middleware'
import * as controller from './admin-auth.controller'
import { loginSchema, mfaSetupVerifySchema, mfaChallengeVerifySchema } from './admin-auth.validator'

export const adminAuthRouter = Router()

adminAuthRouter.post('/login', loginRateLimiter, validate({ body: loginSchema }), controller.login)
adminAuthRouter.post('/mfa/setup/verify', validate({ body: mfaSetupVerifySchema }), controller.verifyMfaSetup)
adminAuthRouter.post('/mfa/verify', validate({ body: mfaChallengeVerifySchema }), controller.verifyMfaChallenge)
adminAuthRouter.post('/refresh', controller.refresh)
adminAuthRouter.post('/logout', adminAuthMiddleware, controller.logout)
adminAuthRouter.get('/me', adminAuthMiddleware, controller.me)
