// ─────────────────────────────────────────────────────────────────────────────
// Rapto — features/billing/api/billing.api.ts
// REST API calls for billing domain.
// ─────────────────────────────────────────────────────────────────────────────

import { api } from "@/lib/api/client";
import type { Subscription, UsageSummary, InvoiceListResponse } from "../types";

// ── Subscription ──────────────────────────────────────────────────────────────

export async function fetchSubscription(): Promise<Subscription> {
  const { data } = await api.get(`/billing/subscription`);
  return data.subscription;
}

// ── Usage ─────────────────────────────────────────────────────────────────────

export async function fetchUsage(): Promise<UsageSummary> {
  const { data } = await api.get(`/billing/usage`);
  return data;
}

// ── Invoices ──────────────────────────────────────────────────────────────────

export async function fetchInvoices(
  cursor?: string
): Promise<InvoiceListResponse> {
  const params = cursor ? { cursor } : {};
  const { data } = await api.get(`/billing/invoices`, {
    params,
  });
  return data;
}

export async function downloadInvoicePdf(invoiceId: string): Promise<Blob> {
  const { data } = await api.get(`/billing/invoices/${invoiceId}/pdf`, {
    responseType: "blob",
  });
  return data;
}

// ── Portal ────────────────────────────────────────────────────────────────────

export async function createBillingPortalSession(): Promise<string> {
  const { data } = await api.post(`/billing/portal`);
  return data.portalUrl;
}

// ── Checkout ──────────────────────────────────────────────────────────────────

export async function createCheckoutSession(
  planId: string,
  interval: "month" | "year"
): Promise<{
  transactionId: string;
  checkoutUrl: string | null;
  /** true when an existing subscription was changed in place (no checkout UI needed) */
  updated?: boolean;
  plan?: string;
  status?: string;
}> {
  const { data } = await api.post(`/billing/checkout`, {
    planId,
    interval,
  });
  return data;
}

// ── Cancel ────────────────────────────────────────────────────────────────────

export async function cancelSubscription(): Promise<void> {
  await api.post(`/billing/cancel`);
}

export interface SyncResult {
  synced: boolean;
  /** synced | no_change | no_subscription (errors are HTTP 503 / 409 and reject the promise) */
  outcome?: string;
  plan: string;
  status?: string;
  subscriptionId?: string;
  trialEnd?: string | null;
}

/** One server-side reconciliation with Paddle. The server is the only authority on the plan. */
export async function syncSubscription(): Promise<SyncResult> {
  const { data } = await api.post(`/billing/sync`);
  return data;
}

/**
 * Right after checkout Paddle may not have the subscription visible yet (or the webhook is still in flight).
 * Retry the SERVER reconciliation a few times; never infer the plan from checkout success on the client.
 * Resolves with the last server answer (plan may still be FREE if Paddle has nothing yet).
 */
export async function syncUntilSubscribed(attempts = 6, delayMs = 3000): Promise<SyncResult | null> {
  let last: SyncResult | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      last = await syncSubscription();
      if (last.plan && last.plan !== "FREE") return last;
    } catch {
      // 503 (Paddle unreachable) / 409 (needs operator): keep retrying; the final state is whatever the server says
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return last;
}
