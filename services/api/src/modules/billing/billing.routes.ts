// ─────────────────────────────────────────────────────────────────────────────
// billing.routes.ts — Route Definitions + Middleware Chain
//
// Middleware discipline per endpoint (from Day 23 spec):
//   GET  /plans      → requireAuth only (pre-onboarding accessible)
//   POST /checkout   → requireAuth + injectTenant + requireRole(ADMIN) + idempotency + validate
//   POST /portal     → requireAuth + injectTenant + requireRole(ADMIN)
//   GET  /subscription → requireAuth + injectTenant
//   GET  /invoices   → requireAuth + injectTenant + requireRole(ADMIN) + validate(pagination)
//   GET  /usage      → requireAuth + injectTenant
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import { injectTenant } from '../../middleware/tenant.middleware'
import { requireRole } from '../../middleware/role.middleware'
import { validate } from '../../middleware/validate.middleware'
import {
  getPlansController,
  createCheckoutController,
  createPortalController,
  getSubscriptionController,
  getInvoicesController,
  getUsageController,
  syncSubscriptionController,
  getWebhookStatusController,
  cancelSubscriptionController,
  getInvoicePdfController,
} from './billing.controller'
import { checkoutSchema, invoicePaginationSchema } from './billing.validator'

const router = Router()

// ── GET /billing/plans ────────────────────────────────────────────────────────
// Edge-cached 1hr at CDN — zero DB/Paddle calls
router.get(
  '/plans',
  requireAuth,
  (_, res, next) => {
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=300')
    next()
  },
  getPlansController
)

// ── POST /billing/checkout ────────────────────────────────────────────────────
// ADMIN only — starts a Paddle checkout transaction
router.post(
  '/checkout',
  requireAuth,
  injectTenant,
  requireRole('ADMIN'),
  validate({ body: checkoutSchema }),
  createCheckoutController
)

// ── POST /billing/portal ──────────────────────────────────────────────────────
// ADMIN only — generates a Paddle Customer Portal URL
router.post(
  '/portal',
  requireAuth,
  injectTenant,
  requireRole('ADMIN'),
  createPortalController
)

// ── GET /billing/subscription ─────────────────────────────────────────────────
// Any authenticated member can view their team's subscription
router.get(
  '/subscription',
  requireAuth,
  injectTenant,
  getSubscriptionController
)

// ── POST /billing/cancel ──────────────────────────────────────────────────────
// ADMIN only — schedules cancellation of active subscription at period end
router.post(
  '/cancel',
  requireAuth,
  injectTenant,
  requireRole('ADMIN'),
  cancelSubscriptionController
)

// ── POST /billing/sync ────────────────────────────────────────────────────────
// ADMIN only — forces live reconciliation with Paddle API
router.post(
  '/sync',
  requireAuth,
  injectTenant,
  requireRole('ADMIN'),
  syncSubscriptionController
)

// ── GET /billing/invoices ─────────────────────────────────────────────────────
// ADMIN only — paginated invoice list with Paddle receipt URLs
router.get(
  '/invoices',
  requireAuth,
  injectTenant,
  requireRole('ADMIN'),
  validate({ query: invoicePaginationSchema }),
  getInvoicesController
)

// ── GET /billing/invoices/:id/pdf ─────────────────────────────────────────────
// ADMIN only — retrieves invoice PDF download receipt URL
router.get(
  '/invoices/:id/pdf',
  requireAuth,
  injectTenant,
  requireRole('ADMIN'),
  getInvoicePdfController
)

// ── GET /billing/usage ────────────────────────────────────────────────────────
// Any authenticated member — reads from same cache as plan-limits.middleware
router.get(
  '/usage',
  requireAuth,
  injectTenant,
  getUsageController
)

// ── GET /billing/webhook-status ───────────────────────────────────────────────
// ADMIN only — returns diagnostic info on Paddle webhook connectivity & health
router.get(
  '/webhook-status',
  requireAuth,
  injectTenant,
  requireRole('ADMIN'),
  getWebhookStatusController
)

export const billingRouter = router
