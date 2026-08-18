// ─────────────────────────────────────────────────────────────────────────────
// billing.repository.ts — Data Layer (Prisma Queries Only)
//
// RULES:
//   ✅ Prisma queries only — zero business logic, zero Paddle SDK imports
//   ✅ Only knows Postgres — never imports from services/paddle.client.ts
//   ✅ Keyed on UNIQUE constraints to prevent race-window upserts
// ─────────────────────────────────────────────────────────────────────────────

import { PlanType, SubscriptionStatus, Prisma } from '@prisma/client'
import { prisma } from '../../db/client'
import type {
  UpsertSubscriptionData,
  UpsertInvoiceData,
  UpsertRefundData,
  CreateBillingAuditLogData,
  PaginatedInvoices,
} from './billing.types'

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
      cancelledAt: true,
      trialStart: true,
      trialEnd: true,
      unitAmount: true,
      currency: true,
    },
  })
}

/**
 * Find full subscription details for a team (including paddleSubscriptionId & paddleCustomerId).
 */
export async function findFullSubscriptionByTeam(teamId: string) {
  return prisma.subscription.findUnique({
    where: { teamId },
    select: {
      id: true,
      teamId: true,
      paddleSubscriptionId: true,
      paddleCustomerId: true,
      paddlePriceId: true,
      plan: true,
      status: true,
      billingInterval: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      cancelledAt: true,
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
      cancelledAt: data.cancelledAt,
      trialStart: data.trialStart,
      trialEnd: data.trialEnd,
      unitAmount: data.unitAmount,
      currency: data.currency ?? 'usd',
    },
    update: {
      paddleSubscriptionId: data.paddleSubscriptionId,
      paddleCustomerId: data.paddleCustomerId,
      ...(data.paddlePriceId && { paddlePriceId: data.paddlePriceId }),
      plan: data.plan,
      billingInterval: data.billingInterval,
      status: data.status,
      ...(data.currentPeriodStart !== undefined && { currentPeriodStart: data.currentPeriodStart }),
      ...(data.currentPeriodEnd !== undefined && { currentPeriodEnd: data.currentPeriodEnd }),
      cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
      ...(data.cancelledAt !== undefined && { cancelledAt: data.cancelledAt }),
      ...(data.trialStart !== undefined && { trialStart: data.trialStart }),
      ...(data.trialEnd !== undefined && { trialEnd: data.trialEnd }),
      ...(data.unitAmount !== undefined && { unitAmount: data.unitAmount }),
      currency: data.currency ?? 'usd',
    },
  })
}

/**
 * Mark a subscription as cancelled. Keyed on unique paddleSubscriptionId.
 */
export async function markSubscriptionCancelled(
  paddleSubscriptionId: string,
  cancelledAt: Date
): Promise<void> {
  await prisma.subscription.update({
    where: { paddleSubscriptionId },
    data: {
      status: SubscriptionStatus.cancelled,
      cancelledAt,
      cancelAtPeriodEnd: false,
    },
  })
}

// ── Transactions ──────────────────────────────────────────────────────────────

/**
 * Handle new checkout / renewal (transaction.completed).
 * Uses a Prisma transaction to guarantee consistency across Subscription, Team, and Invoice.
 */
export async function activateSubscriptionTransaction(
  teamId: string,
  plan: PlanType,
  subscriptionData: UpsertSubscriptionData | null,
  invoiceData: (UpsertInvoiceData & { paddleTransactionId: string }) | null,
  periodStart: Date,
  periodEnd: Date
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (subscriptionData) {
      await tx.subscription.upsert({
        where: { teamId },
        create: {
          teamId,
          ...subscriptionData,
          cancelAtPeriodEnd: subscriptionData.cancelAtPeriodEnd ?? false,
          currency: subscriptionData.currency ?? 'usd',
        },
        update: {
          paddleSubscriptionId: subscriptionData.paddleSubscriptionId,
          paddleCustomerId: subscriptionData.paddleCustomerId,
          ...(subscriptionData.paddlePriceId && { paddlePriceId: subscriptionData.paddlePriceId }),
          plan: subscriptionData.plan,
          billingInterval: subscriptionData.billingInterval,
          status: subscriptionData.status,
          cancelAtPeriodEnd: subscriptionData.cancelAtPeriodEnd ?? false,
          currency: subscriptionData.currency ?? 'usd',
          ...(subscriptionData.currentPeriodStart !== undefined && { currentPeriodStart: subscriptionData.currentPeriodStart }),
          ...(subscriptionData.currentPeriodEnd !== undefined && { currentPeriodEnd: subscriptionData.currentPeriodEnd }),
          ...(subscriptionData.trialStart !== undefined && { trialStart: subscriptionData.trialStart }),
          ...(subscriptionData.trialEnd !== undefined && { trialEnd: subscriptionData.trialEnd }),
          ...(subscriptionData.unitAmount !== undefined && { unitAmount: subscriptionData.unitAmount }),
          ...(subscriptionData.cancelledAt !== undefined && { cancelledAt: subscriptionData.cancelledAt }),
        },
      })
    }

    if (!subscriptionData || subscriptionData.status === SubscriptionStatus.active || subscriptionData.status === SubscriptionStatus.trialing) {
      await tx.team.update({
        where: { id: teamId },
        data: {
          plan,
          meetingsUsed: 0,
          billingCycleStart: periodStart,
          billingCycleEnd: periodEnd,
          gracePeriodEnd: null,
        },
      })
    }

    if (invoiceData) {
      await tx.invoice.upsert({
        where: { paddleTransactionId: invoiceData.paddleTransactionId },
        create: {
          teamId,
          ...invoiceData,
          amountRefunded: invoiceData.amountRefunded ?? 0,
        },
        update: {
          amountPaid: invoiceData.amountPaid,
          status: invoiceData.status,
          hostedInvoiceUrl: invoiceData.hostedInvoiceUrl,
          paidAt: invoiceData.paidAt,
        },
      })
    }
  })
}

/**
 * Handle subscription upgrades/downgrades (subscription.updated).
 */
export async function updateSubscriptionTransaction(
  teamId: string,
  plan: PlanType,
  subscriptionData: UpsertSubscriptionData
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.subscription.upsert({
      where: { teamId },
      create: {
        teamId,
        ...subscriptionData,
        cancelAtPeriodEnd: subscriptionData.cancelAtPeriodEnd ?? false,
        currency: subscriptionData.currency ?? 'usd',
      },
      update: {
        paddleSubscriptionId: subscriptionData.paddleSubscriptionId,
        paddleCustomerId: subscriptionData.paddleCustomerId,
        ...(subscriptionData.paddlePriceId && { paddlePriceId: subscriptionData.paddlePriceId }),
        plan: subscriptionData.plan,
        billingInterval: subscriptionData.billingInterval,
        status: subscriptionData.status,
        cancelAtPeriodEnd: subscriptionData.cancelAtPeriodEnd ?? false,
        currency: subscriptionData.currency ?? 'usd',
        ...(subscriptionData.currentPeriodStart !== undefined && { currentPeriodStart: subscriptionData.currentPeriodStart }),
        ...(subscriptionData.currentPeriodEnd !== undefined && { currentPeriodEnd: subscriptionData.currentPeriodEnd }),
        ...(subscriptionData.trialStart !== undefined && { trialStart: subscriptionData.trialStart }),
        ...(subscriptionData.trialEnd !== undefined && { trialEnd: subscriptionData.trialEnd }),
        ...(subscriptionData.unitAmount !== undefined && { unitAmount: subscriptionData.unitAmount }),
        ...(subscriptionData.cancelledAt !== undefined && { cancelledAt: subscriptionData.cancelledAt }),
      },
    })

    // Only update team plan if subscription is active or trialing
    if (
      subscriptionData.status === SubscriptionStatus.active ||
      subscriptionData.status === SubscriptionStatus.trialing
    ) {
      await tx.team.update({
        where: { id: teamId },
        data: {
          plan,
          ...(subscriptionData.currentPeriodStart && { billingCycleStart: subscriptionData.currentPeriodStart }),
          ...(subscriptionData.currentPeriodEnd && { billingCycleEnd: subscriptionData.currentPeriodEnd }),
          gracePeriodEnd: null,
        },
      })
    } else if (
      subscriptionData.status === SubscriptionStatus.cancelled ||
      subscriptionData.status === SubscriptionStatus.paused
    ) {
      await tx.team.update({
        where: { id: teamId },
        data: {
          plan: PlanType.FREE,
        },
      })
    }
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
      amountRefunded: data.amountRefunded ?? 0,
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
      ...(data.amountRefunded !== undefined && { amountRefunded: data.amountRefunded }),
    },
  })
}

/**
 * Find invoice by Paddle Transaction ID.
 */
export async function findInvoiceByTransactionId(paddleTransactionId: string) {
  return prisma.invoice.findUnique({
    where: { paddleTransactionId },
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
      amountRefunded: true,
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

// ── Refunds & Adjustments ─────────────────────────────────────────────────────

/**
 * Record a refund adjustment transaction and update invoice and subscription state atomically.
 */
export async function processRefundAdjustmentTransaction(params: {
  teamId: string
  paddleTransactionId: string
  paddleAdjustmentId: string
  amountRefunded: number
  currency: string
  reason?: string
  status: string
}): Promise<{ isFullRefund: boolean }> {
  const { teamId, paddleTransactionId, paddleAdjustmentId, amountRefunded, currency, reason, status } = params

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { paddleTransactionId },
    })

    if (!invoice) {
      throw new Error(`Invoice not found for transaction: ${paddleTransactionId}`)
    }

    await tx.refund.upsert({
      where: { paddleAdjustmentId },
      create: {
        teamId,
        invoiceId: invoice.id,
        paddleAdjustmentId,
        amount: amountRefunded,
        currency,
        reason: reason ?? 'customer_refund',
        status: status || 'completed',
      },
      update: {
        status: status || 'completed',
      },
    })

    const totalRefunded = invoice.amountRefunded + amountRefunded
    const isFullRefund = totalRefunded >= invoice.amountPaid

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        amountRefunded: totalRefunded,
        status: isFullRefund ? 'refunded' : invoice.status,
      },
    })

    if (isFullRefund) {
      await tx.team.update({
        where: { id: teamId },
        data: { plan: PlanType.FREE },
      })
      await tx.subscription.updateMany({
        where: { teamId },
        data: { status: SubscriptionStatus.refunded },
      })
    }

    return { isFullRefund }
  })
}

// ── Audit Log ─────────────────────────────────────────────────────────────────

/**
 * Insert an immutable record into the BillingAuditLog table.
 */
export async function createBillingAuditLog(data: CreateBillingAuditLogData): Promise<void> {
  try {
    await prisma.billingAuditLog.create({
      data: {
        teamId: data.teamId,
        eventId: data.eventId,
        eventType: data.eventType,
        action: data.action,
        payload: (data.payload ?? {}) as Prisma.InputJsonValue,
      },
    })
  } catch (err: any) {
    // If unique eventId already recorded, ignore duplicate audit log
    if (err?.code !== 'P2002') {
      throw err
    }
  }
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
      gracePeriodEnd: null,
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
      gracePeriodEnd: null,
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
