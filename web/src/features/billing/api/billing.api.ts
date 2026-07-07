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
): Promise<{ transactionId: string; checkoutUrl: string | null }> {
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
