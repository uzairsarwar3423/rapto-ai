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

// ── POST /billing/sync ────────────────────────────────────────────────────────

export async function syncSubscriptionController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const teamId = req.teamId!
    const result = await billingService.syncSubscription(teamId)
    res.status(200).json(result)
  } catch (err) {
    next(err)
  }
}

// ── GET /billing/webhook-status ───────────────────────────────────────────────

export async function getWebhookStatusController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const isConfigured = Boolean(process.env.PADDLE_WEBHOOK_SECRET && process.env.PADDLE_WEBHOOK_SECRET.trim() !== '')
    const { redis } = await import('../../config/redis')
    const lastWebhookReceivedAt = await redis.get('paddle:last_webhook_received_at')

    res.status(200).json({
      configured: isConfigured,
      webhookEndpoint: 'https://app.rapto.cloud/api/v1/webhooks/paddle',
      lastWebhookReceivedAt: lastWebhookReceivedAt ? new Date(parseInt(lastWebhookReceivedAt, 10)).toISOString() : null,
      status: isConfigured ? 'healthy' : 'unconfigured_secret',
    })
  } catch (err) {
    next(err)
  }
}

// ── POST /billing/cancel ──────────────────────────────────────────────────────

export async function cancelSubscriptionController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const teamId = req.teamId!
    const result = await billingService.cancelSubscription(teamId)
    res.status(200).json(result)
  } catch (err) {
    next(err)
  }
}

// ── GET /billing/invoices/:id/pdf ─────────────────────────────────────────────

export async function getInvoicePdfController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const teamId = req.teamId!
    const invoiceId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string
    const result = await billingService.getInvoicePdf(teamId, invoiceId)
    if (result.url) {
      if (req.accepts('json') || String(req.headers.accept || '').includes('application/json')) {
        res.status(200).json(result)
      } else {
        res.redirect(result.url)
      }
    } else {
      res.status(404).json({ error: 'Invoice PDF not available' })
    }
  } catch (err) {
    next(err)
  }
}
