// ─────────────────────────────────────────────────────────────────────────────
// billing.repository.ts — Data Layer (Prisma Queries Only)
//
// RULES:
//   ✅ Prisma queries only — zero business logic, zero Paddle SDK imports
//   ✅ Only knows Postgres — never imports from services/paddle.client.ts
//   ✅ Keyed on UNIQUE constraints to prevent race-window upserts
// ─────────────────────────────────────────────────────────────────────────────

import { PlanType } from '@prisma/client'
import { prisma } from '../../db/client'
import type { UpsertSubscriptionData, UpsertInvoiceData, PaginatedInvoices } from './billing.types'

// ── Subscription ──────────────────────────────────────────────────────────────

/**
 * Find the subscription for a team.
 * Returns null if team has never subscribed (is on FREE plan naturally).
 */
export async function findSubscriptionByTeam(teamId: string) {
  return prisma.subscription.findUnique({
    where: { teamId },
    select: {
      plan: true,
      status: true,
      billingInterval: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      trialStart: true,
      trialEnd: true,
      unitAmount: true,
      currency: true,
    },
  })
}

/**
 * Upsert the subscription row for a team.
 * Keyed on UNIQUE teamId — zero read-before-write race window.
 * Called by webhook handlers ONLY — never called from user-facing endpoints.
 */
export async function upsertSubscription(
  teamId: string,
  data: UpsertSubscriptionData
): Promise<void> {
  await prisma.subscription.upsert({
    where: { teamId },
    create: {
      teamId,
      paddleSubscriptionId: data.paddleSubscriptionId,
      paddleCustomerId: data.paddleCustomerId,
      paddlePriceId: data.paddlePriceId,
      plan: data.plan,
      billingInterval: data.billingInterval,
      status: data.status,
      currentPeriodStart: data.currentPeriodStart,
      currentPeriodEnd: data.currentPeriodEnd,
      cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
      trialStart: data.trialStart,
      trialEnd: data.trialEnd,
      unitAmount: data.unitAmount,
      currency: data.currency ?? 'usd',
    },
    update: {
      paddlePriceId: data.paddlePriceId,
      plan: data.plan,
      billingInterval: data.billingInterval,
      status: data.status,
      currentPeriodStart: data.currentPeriodStart,
      currentPeriodEnd: data.currentPeriodEnd,
      cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
      cancelledAt: data.cancelledAt,
      trialStart: data.trialStart,
      trialEnd: data.trialEnd,
      unitAmount: data.unitAmount,
      currency: data.currency ?? 'usd',
    },
  })
}

/**
 * Mark a subscription as cancelled. Keyed on unique paddleSubscriptionId.
 * team.plan is set to FREE by the webhook handler (not here — separate concerns).
 */
export async function markSubscriptionCancelled(
  paddleSubscriptionId: string,
  cancelledAt: Date
): Promise<void> {
  await prisma.subscription.update({
    where: { paddleSubscriptionId },
    data: {
      status: 'cancelled',
      cancelledAt,
      cancelAtPeriodEnd: false,
    },
  })
}

// ── Invoice ────────────────────────────────────────────────────────────────────

/**
 * Upsert an invoice record.
 * Keyed on UNIQUE paddleTransactionId — safe to replay from webhook.
 */
export async function upsertInvoice(
  teamId: string,
  paddleTransactionId: string,
  data: UpsertInvoiceData
): Promise<void> {
  await prisma.invoice.upsert({
    where: { paddleTransactionId },
    create: {
      teamId,
      paddleTransactionId,
      paddleCustomerId: data.paddleCustomerId,
      amountDue: data.amountDue,
      amountPaid: data.amountPaid,
      currency: data.currency,
      status: data.status,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      hostedInvoiceUrl: data.hostedInvoiceUrl,
      paidAt: data.paidAt,
    },
    update: {
      amountPaid: data.amountPaid,
      status: data.status,
      hostedInvoiceUrl: data.hostedInvoiceUrl,
      paidAt: data.paidAt,
    },
  })
}

/**
 * Cursor-paginated invoice list — newest first.
 * Used by GET /billing/invoices.
 */
export async function findInvoicesByTeam(
  teamId: string,
  cursor: string | null,
  limit: number
): Promise<PaginatedInvoices> {
  const invoices = await prisma.invoice.findMany({
    where: { teamId },
    orderBy: { createdAt: 'desc' },
    take: limit + 1, // fetch one extra to determine if there's a next page
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      amountDue: true,
      amountPaid: true,
      currency: true,
      status: true,
      hostedInvoiceUrl: true,
      paidAt: true,
      createdAt: true,
    },
  })

  const hasMore = invoices.length > limit
  const page = hasMore ? invoices.slice(0, limit) : invoices
  const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null

  return { invoices: page, nextCursor }
}

// ── Team billing fields ────────────────────────────────────────────────────────

/**
 * Atomically update team plan + reset meetingsUsed.
 * Called on transaction.completed (new subscription + renewals).
 */
export async function activateTeamPlan(
  teamId: string,
  plan: PlanType,
  billingCycleStart: Date,
  billingCycleEnd: Date
): Promise<void> {
  await prisma.team.update({
    where: { id: teamId },
    data: {
      plan,
      meetingsUsed: 0,
      billingCycleStart,
      billingCycleEnd,
    },
  })
}

/**
 * Reset meetings used counter at the billing cycle boundary.
 * Called on every renewal transaction.completed event.
 */
export async function resetMeetingsUsedForTeam(teamId: string): Promise<void> {
  await prisma.team.update({
    where: { id: teamId },
    data: { meetingsUsed: 0 },
  })
}

/**
 * Downgrade team to FREE. Historical data is NEVER deleted.
 * Called on subscription.canceled.
 */
export async function downgradeTeamToFree(teamId: string): Promise<void> {
  await prisma.team.update({
    where: { id: teamId },
    data: {
      plan: PlanType.FREE,
      billingCycleEnd: null,
    },
  })
}

/**
 * Update team plan (used on subscription.updated — upgrades/downgrades).
 */
export async function updateTeamPlan(teamId: string, plan: PlanType): Promise<void> {
  await prisma.team.update({
    where: { id: teamId },
    data: { plan },
  })
}

/**
 * Get team's billing-relevant fields for usage calculation.
 */
export async function getTeamForUsage(teamId: string) {
  return prisma.team.findUnique({
    where: { id: teamId },
    select: {
      plan: true,
      meetingsUsed: true,
      billingCycleEnd: true,
      _count: {
        select: { members: { where: { deletedAt: null } } },
      },
    },
  })
}
