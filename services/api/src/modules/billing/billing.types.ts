// ─────────────────────────────────────────────────────────────────────────────
// billing.types.ts — All TypeScript types for the billing module
//
// Provider-agnostic response shapes — the frontend never needs to know
// whether Paddle or Stripe is behind these interfaces.
// ─────────────────────────────────────────────────────────────────────────────

import type { PlanType, SubscriptionStatus } from '@prisma/client'

// ── Checkout / Portal ─────────────────────────────────────────────────────────

export interface CheckoutResult {
  /** Paddle transaction ID — used by Paddle.js overlay checkout on the frontend */
  transactionId: string
  /** Paddle hosted checkout URL — used for redirect-based checkout */
  checkoutUrl: string | null
}

export interface PortalResult {
  portalUrl: string
}

// ── Subscription ──────────────────────────────────────────────────────────────

export interface SubscriptionDetail {
  plan: PlanType
  status: SubscriptionStatus
  billingInterval: string | null
  currentPeriodStart: Date | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  trialStart: Date | null
  trialEnd: Date | null
  unitAmount: number | null
  currency: string
}

// ── Invoice ────────────────────────────────────────────────────────────────────

export interface InvoiceListItem {
  id: string
  amountDue: number
  amountPaid: number
  currency: string
  status: string
  hostedInvoiceUrl: string | null
  paidAt: Date | null
  createdAt: Date
}

export interface PaginatedInvoices {
  invoices: InvoiceListItem[]
  nextCursor: string | null
}

// ── Usage ──────────────────────────────────────────────────────────────────────

export interface UsageDetail {
  meetingsUsed: number
  meetingsLimit: number   // -1 = unlimited
  membersCount: number
  membersLimit: number    // -1 = unlimited
  billingCycleEnd: Date | null
  percentUsed: number     // 0–100, capped — -1 when unlimited
}

// ── Plans Display ─────────────────────────────────────────────────────────────

export interface PlanDisplayItem {
  id: PlanType
  name: string
  monthlyPriceCents: number   // -1 = contact sales
  meetings: number            // -1 = unlimited
  members: number             // -1 = unlimited
  historyDays: number         // -1 = unlimited
  storageGB: number           // -1 = unlimited
  apiAccess: boolean
  ssoEnabled: boolean
}

// ── Webhook Internal Types ────────────────────────────────────────────────────

export interface PaddleWebhookCustomData {
  teamId: string
  planId: PlanType
  interval: 'month' | 'year'
}

export interface UpsertSubscriptionData {
  paddleSubscriptionId: string
  paddleCustomerId: string
  paddlePriceId?: string
  plan: PlanType
  billingInterval: string
  status: SubscriptionStatus
  currentPeriodStart?: Date
  currentPeriodEnd?: Date
  cancelAtPeriodEnd?: boolean
  cancelledAt?: Date
  trialStart?: Date
  trialEnd?: Date
  unitAmount?: number
  currency?: string
}

export interface UpsertInvoiceData {
  paddleCustomerId: string
  amountDue: number
  amountPaid: number
  currency: string
  status: string
  periodStart?: Date
  periodEnd?: Date
  hostedInvoiceUrl?: string
  paidAt?: Date
}
