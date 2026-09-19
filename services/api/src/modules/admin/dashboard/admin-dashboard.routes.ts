import { Router } from 'express'
import { validate } from '../../../middleware/validate.middleware'
import { adminAuthMiddleware } from '../../../middleware/admin-auth.middleware'
import { requireAdminRole } from '../../../middleware/admin-role.middleware'
import * as controller from './admin-dashboard.controller'
import {
  dateRangeSchema,
  trendQuerySchema,
  cohortQuerySchema,
  topTeamsQuerySchema,
  planMixQuerySchema,
} from './admin-dashboard.validator'

export const adminDashboardRouter = Router()

// Every route: any authenticated staff role can VIEW the dashboard — restrictions
// start with mutating actions on the Subscriptions tab (Days 11–15), not here.
adminDashboardRouter.use(adminAuthMiddleware, requireAdminRole('READONLY'))

adminDashboardRouter.get(
  '/overview',
  validate({ query: dateRangeSchema as any }),
  controller.getOverview
)

adminDashboardRouter.get(
  '/revenue-trend',
  validate({ query: trendQuerySchema as any }),
  controller.getRevenueTrend
)

adminDashboardRouter.get(
  '/mrr-trend',
  validate({ query: trendQuerySchema as any }),
  controller.getMrrTrend
)

adminDashboardRouter.get(
  '/mrr-movement',
  validate({ query: dateRangeSchema as any }),
  controller.getMrrMovement
)

adminDashboardRouter.get(
  '/plan-mix',
  validate({ query: planMixQuerySchema as any }),
  controller.getPlanMix
)

adminDashboardRouter.get(
  '/cohort-retention',
  validate({ query: cohortQuerySchema as any }),
  controller.getCohortRetention
)

adminDashboardRouter.get(
  '/top-teams',
  validate({ query: topTeamsQuerySchema as any }),
  controller.getTopTeams
)
