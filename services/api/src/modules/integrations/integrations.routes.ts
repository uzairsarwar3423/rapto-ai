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
    connectCalendarController,
    calendarCallbackController,
    // Jira-specific (Day 58)
    connectJiraController,
    jiraCallbackController,
    listJiraProjectsController,
    configureJiraController,
    disconnectJiraController,
    // Slack-specific (Day 60)
    connectSlackController,
    slackCallbackController,
    listSlackChannelsController,
    configureSlackController,
    disconnectSlackController,
    // Linear-specific (Day 61)
    connectLinearController,
    linearCallbackController,
    listLinearTeamsController,
    configureLinearController,
    disconnectLinearController,
} from './integrations.controller'
import {
    providerParamSchema,
    calendarProviderParamSchema,
    callbackQuerySchema,
    configureJiraBodySchema,
    jiraCallbackQuerySchema,
    configureSlackBodySchema,
    slackCallbackQuerySchema,
    configureLinearBodySchema,
    linearCallbackQuerySchema,
} from './integrations.validator'
import { calendarSyncNowRateLimiter } from '../../middleware/rate-limit.middleware'

const router = Router()

// ─────────────────────────────────────────────────────────────────────────────
// List all integrations (returns { teamIntegrations, userIntegrations })
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', requireAuth, injectTenant, listIntegrationsController)

// ─────────────────────────────────────────────────────────────────────────────
// Calendar Sync
// ─────────────────────────────────────────────────────────────────────────────
router.get('/calendar/preview', requireAuth, getCalendarPreviewController)

router.post(
    '/google-calendar/sync-now',
    requireAuth,
    calendarSyncNowRateLimiter,
    syncNowController
)

router.post(
    '/outlook-calendar/sync-now',
    requireAuth,
    calendarSyncNowRateLimiter,
    syncNowController
)

router.get('/google-calendar/connect', requireAuth, connectCalendarController)
router.get('/google-calendar/callback', calendarCallbackController)

router.get('/outlook-calendar/connect', requireAuth, connectCalendarController)
router.get('/outlook-calendar/callback', calendarCallbackController)

// ─────────────────────────────────────────────────────────────────────────────
// JIRA-SPECIFIC ROUTES (Day 58 §13, §24)
//
// Route ordering matters: specific routes BEFORE the /:provider/* wildcard routes.
// If jira/* routes came after /:provider/*, Express would never reach them
// because :provider would match 'jira' first.
//
// Security model per §13:
//   - connect, projects, configure, disconnect: requireAuth + injectTenant + requireRole('ADMIN', 'OWNER')
//   - callback: NO requireAuth — secured by the Redis state token (single-use, 10-min TTL)
//     The user's session may have aged during the OAuth round-trip; the state token
//     is the ONLY required security boundary here.
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/v1/integrations/jira/connect → 200 { authUrl } */
router.get(
    '/jira/connect',
    requireAuth,
    injectTenant,
    requireRole('ADMIN', 'OWNER'),
    connectJiraController
)

/** GET /api/v1/integrations/jira/callback → 302 redirect (no JWT required) */
router.get(
    '/jira/callback',
    validate(jiraCallbackQuerySchema),
    jiraCallbackController
)

/** GET /api/v1/integrations/jira/projects → 200 { projects: [{key, name}] } */
router.get(
    '/jira/projects',
    requireAuth,
    injectTenant,
    requireRole('ADMIN', 'OWNER'),
    listJiraProjectsController
)

/** PATCH /api/v1/integrations/jira/configure → 200 { success, data: { metadata } } */
router.patch(
    '/jira/configure',
    requireAuth,
    injectTenant,
    requireRole('ADMIN', 'OWNER'),
    validate(configureJiraBodySchema),
    configureJiraController
)

/** DELETE /api/v1/integrations/jira → 200 { success, data: { message } } */
router.delete(
    '/jira',
    requireAuth,
    injectTenant,
    requireRole('ADMIN', 'OWNER'),
    disconnectJiraController
)

// ─────────────────────────────────────────────────────────────────────────────
// SLACK-SPECIFIC ROUTES (Day 60 §12)
// ─────────────────────────────────────────────────────────────────────────────

router.get(
    '/slack/connect',
    requireAuth,
    injectTenant,
    requireRole('ADMIN', 'OWNER'),
    connectSlackController
)

router.get(
    '/slack/callback',
    validate(slackCallbackQuerySchema),
    slackCallbackController
)

router.get(
    '/slack/channels',
    requireAuth,
    injectTenant,
    requireRole('ADMIN', 'OWNER'),
    listSlackChannelsController
)

router.patch(
    '/slack/configure',
    requireAuth,
    injectTenant,
    requireRole('ADMIN', 'OWNER'),
    validate(configureSlackBodySchema),
    configureSlackController
)

router.delete(
    '/slack',
    requireAuth,
    injectTenant,
    requireRole('ADMIN', 'OWNER'),
    disconnectSlackController
)

// ─────────────────────────────────────────────────────────────────────────────
// LINEAR-SPECIFIC ROUTES (Day 61)
// ─────────────────────────────────────────────────────────────────────────────

router.get(
    '/linear/connect',
    requireAuth,
    injectTenant,
    requireRole('ADMIN', 'OWNER'),
    connectLinearController
)

router.get(
    '/linear/callback',
    validate(linearCallbackQuerySchema),
    linearCallbackController
)

router.get(
    '/linear/teams',
    requireAuth,
    injectTenant,
    requireRole('ADMIN', 'OWNER'),
    listLinearTeamsController
)

router.patch(
    '/linear/configure',
    requireAuth,
    injectTenant,
    requireRole('ADMIN', 'OWNER'),
    validate(configureLinearBodySchema),
    configureLinearController
)

router.delete(
    '/linear',
    requireAuth,
    injectTenant,
    requireRole('ADMIN', 'OWNER'),
    disconnectLinearController
)

// ─────────────────────────────────────────────────────────────────────────────
// Generic Team Integration OAuth (for Linear, Slack, Notion)
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// User Calendar Integration management
// ─────────────────────────────────────────────────────────────────────────────
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
