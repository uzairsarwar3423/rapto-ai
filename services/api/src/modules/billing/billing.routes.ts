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

// ── GET /billing/usage ────────────────────────────────────────────────────────
// Any authenticated member — reads from same cache as plan-limits.middleware
router.get(
  '/usage',
  requireAuth,
  injectTenant,
  getUsageController
)

export const billingRouter = router
