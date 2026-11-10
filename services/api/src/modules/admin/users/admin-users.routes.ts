import { Router } from 'express'
import { validate } from '../../../middleware/validate.middleware'
import { adminAuthMiddleware } from '../../../middleware/admin-auth.middleware'
import { requireAdminRole } from '../../../middleware/admin-role.middleware'
import * as controller from './admin-users.controller'
import { listUsersSchema, listTeamsSchema } from './admin-users.validator'

export const adminUsersRouter = Router()

// Any authenticated staff role can VIEW lists. Restrictions begin with mutating actions (Day 6+).
adminUsersRouter.use(adminAuthMiddleware, requireAdminRole('READONLY'))

// ROUTE ORDER MATTERS: static paths first (/summary → /teams → future /teams/:teamId → future /:userId), or a param route
// would swallow them ("summary" captured as a user id — the wildcard-collision bug).
adminUsersRouter.get('/summary', controller.getSummary)
adminUsersRouter.get('/teams', validate({ query: listTeamsSchema as any }), controller.listTeams)
adminUsersRouter.get('/', validate({ query: listUsersSchema as any }), controller.listUsers)
