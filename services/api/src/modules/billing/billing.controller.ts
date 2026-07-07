// ─────────────────────────────────────────────────────────────────────────────
// billing.controller.ts — HTTP Layer (Thin Translation Only)
//
// RULES:
//   ✅ req → service → res, nothing else
//   ✅ Never imports Paddle SDK directly — all Paddle calls go through service
//   ✅ Never contains business logic
// ─────────────────────────────────────────────────────────────────────────────

import type { Request, Response, NextFunction } from 'express'
import { logger } from '../../config/logger'
import * as billingService from './billing.service'
import type { CheckoutInput, InvoicePaginationInput } from './billing.validator'

// ── GET /billing/plans ────────────────────────────────────────────────────────

export async function getPlansController(
  _req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  const plans = billingService.getPlans()
  res.status(200).json({ plans })
}

// ── POST /billing/checkout ────────────────────────────────────────────────────

export async function createCheckoutController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { planId, interval } = req.body as CheckoutInput
    const teamId = req.teamId!
    const userId = req.user!.id
    const requesterEmail = req.user!.email
    const requesterName = requesterEmail

    const result = await billingService.createCheckoutSession({
      teamId,
      userId,
      requesterEmail,
      requesterName,
      planId,
      interval,
    })

    res.status(200).json(result)
  } catch (err) {
    next(err)
  }
}

// ── POST /billing/portal ──────────────────────────────────────────────────────

export async function createPortalController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const teamId = req.teamId!
    const result = await billingService.createPortalSession(teamId)
    res.status(200).json(result)
  } catch (err) {
    next(err)
  }
}

// ── GET /billing/subscription ─────────────────────────────────────────────────

export async function getSubscriptionController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const teamId = req.teamId!
    const subscription = await billingService.getSubscription(teamId)
    // Returns null for free-plan teams — frontend handles null gracefully
    res.status(200).json({ subscription })
  } catch (err) {
    next(err)
  }
}

// ── GET /billing/invoices ─────────────────────────────────────────────────────

export async function getInvoicesController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const teamId = req.teamId!
    const { cursor, limit } = req.query as unknown as InvoicePaginationInput
    const result = await billingService.getInvoices(teamId, cursor ?? null, limit ?? 20)
    res.status(200).json(result)
  } catch (err) {
    next(err)
  }
}

// ── GET /billing/usage ────────────────────────────────────────────────────────

export async function getUsageController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const teamId = req.teamId!
    const usage = await billingService.getUsage(teamId)
    res.status(200).json(usage)
  } catch (err) {
    next(err)
  }
}
