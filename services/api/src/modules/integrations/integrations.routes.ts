import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import { injectTenant } from '../../middleware/tenant.middleware'
import { requireRole } from '../../middleware/role.middleware'
import { validate } from '../../middleware/validate.middleware'
import {
    listIntegrationsController,
    connectController,
    callbackController,
    disconnectController,
    testConnectionController,
    updateConfigController,
    getProviderOptionsController,
    testCalendarConnectionController,
    disconnectCalendarController,
    updateCalendarConfigController,
    getCalendarPreviewController,
    syncNowController,
    connectGoogleCalendarController,
    googleCalendarCallbackController
} from './integrations.controller'
import { providerParamSchema, calendarProviderParamSchema, callbackQuerySchema } from './integrations.validator'

const router = Router()

// List all integrations (returns { teamIntegrations, userIntegrations })
router.get('/', requireAuth, injectTenant, listIntegrationsController)

// Calendar Sync Preview
router.get('/calendar/preview', requireAuth, getCalendarPreviewController)

import { calendarSyncNowRateLimiter } from '../../middleware/rate-limit.middleware'

// Calendar Sync Now
router.post(
    '/google-calendar/sync-now',
    requireAuth,
    calendarSyncNowRateLimiter,
    syncNowController
)

// Specific Google Calendar OAuth Connect & Callback
router.get(
    '/google-calendar/connect',
    requireAuth,
    connectGoogleCalendarController
)

router.get(
    '/google-calendar/callback',
    googleCalendarCallbackController
)

// Team Integration OAuth
router.get(
    '/:provider/connect',
    requireAuth,
    injectTenant,
    requireRole('ADMIN', 'OWNER'),
    validate(providerParamSchema),
    connectController
)

router.get(
    '/:provider/callback',
    validate(callbackQuerySchema),
    callbackController
)

// Team Integration management
router.delete(
    '/:provider',
    requireAuth,
    injectTenant,
    requireRole('ADMIN', 'OWNER'),
    validate(providerParamSchema),
    disconnectController
)

router.post(
    '/:provider/test',
    requireAuth,
    injectTenant,
    requireRole('ADMIN', 'OWNER'),
    validate(providerParamSchema),
    testConnectionController
)

router.patch(
    '/:provider/config',
    requireAuth,
    injectTenant,
    requireRole('ADMIN', 'OWNER'),
    validate(providerParamSchema),
    updateConfigController
)

router.get(
    '/:provider/options',
    requireAuth,
    injectTenant,
    requireRole('ADMIN', 'OWNER'),
    validate(providerParamSchema),
    getProviderOptionsController
)

// User Calendar Integration management
router.post(
    '/calendar/:provider/test',
    requireAuth,
    validate(calendarProviderParamSchema),
    testCalendarConnectionController
)

router.delete(
    '/calendar/:provider',
    requireAuth,
    validate(calendarProviderParamSchema),
    disconnectCalendarController
)

router.patch(
    '/calendar/:provider/config',
    requireAuth,
    validate(calendarProviderParamSchema),
    updateCalendarConfigController
)

export const integrationsRouter = router

