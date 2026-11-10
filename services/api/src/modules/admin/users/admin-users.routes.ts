import { Router } from 'express'
import { validate } from '../../../middleware/validate.middleware'
import { adminAuthMiddleware } from '../../../middleware/admin-auth.middleware'
import { requireAdminRole } from '../../../middleware/admin-role.middleware'
import * as controller from './admin-users.controller'
import { listUsersSchema, listTeamsSchema } from './admin-users.validator'

export const adminUsersRouter = Router()

// Any authenticated staff role can VIEW lists. Restrictions begin with mutating actions (Day 6+).
adminUsersRouter.use(adminAuthMiddleware, requireAdminRole('READONLY'))

// Register /teams BEFORE any future /:userId route, or "teams" would be captured as a user id (wildcard collision).
adminUsersRouter.get('/teams', validate({ query: listTeamsSchema as any }), controller.listTeams)
adminUsersRouter.get('/', validate({ query: listUsersSchema as any }), controller.listUsers)
