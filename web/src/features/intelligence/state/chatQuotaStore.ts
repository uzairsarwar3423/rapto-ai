/**
 * chatQuotaStore.ts — what the client knows about the user's remaining questions and any cool-down.
 *
 * Day 58 only reports `quota_remaining` after a message (the `usage` event) and a 429 body; there is no endpoint that
 * returns it on first load (plan §3.3 amendment, not yet delivered). So before the first answer the quota is UNKNOWN and
 * the UI shows nothing rather than a wrong number. When the backend adds `quota {limit, remaining, resets_at}` it flows
 * in through the same `applyUsage` and the percentage-based thresholds activate automatically.
 */
import { create } from "zustand";
import type { Quota } from "@/lib/contracts/chat";

/** Fallback "running low" threshold while the limit is unknown. */
export const LOW_QUOTA_ABSOLUTE = 10;
/** With a known limit: warn at ≤ 20 % remaining. */
export const LOW_QUOTA_FRACTION = 0.2;

export interface QuotaState {
  remaining: number | null;
  limit: number | null;
  scope: string | null;
  /** ms epoch when the quota resets, if known. */
  resetsAt: number | null;
  /** ms epoch until which sending is blocked by a 429 RATE_LIMITED. */
  cooldownUntil: number | null;
  applyUsage: (u: { quotaRemaining: number | null; quota: Quota | null }) => void;
  applyExhausted: (resetsInS: number | null, resetsAtIso?: string | null) => void;
  applyCooldown: (seconds: number) => void;
  clearCooldown: () => void;
  reset: () => void;
}

const blank = { remaining: null, limit: null, scope: null, resetsAt: null, cooldownUntil: null } as const;

export const useChatQuota = create<QuotaState>((set) => ({
  ...blank,
  applyUsage: ({ quotaRemaining, quota }) =>
    set((s) => ({
      remaining: quota?.remaining ?? quotaRemaining ?? s.remaining,
      limit: quota?.limit ?? s.limit,
      scope: quota?.scope ?? s.scope,
      resetsAt: quota?.resets_at ? Date.parse(quota.resets_at) || s.resetsAt : s.resetsAt,
    })),
  applyExhausted: (resetsInS, resetsAtIso) =>
    set({
      remaining: 0,
      resetsAt: resetsAtIso ? Date.parse(resetsAtIso) || null : resetsInS != null ? Date.now() + resetsInS * 1000 : null,
    }),
  applyCooldown: (seconds) => set({ cooldownUntil: Date.now() + Math.max(1, Math.ceil(seconds)) * 1000 }),
  clearCooldown: () => set({ cooldownUntil: null }),
  reset: () => set({ ...blank }),
}));

export type QuotaLevel = "unknown" | "ok" | "low" | "exhausted";

export function quotaLevel(q: Pick<QuotaState, "remaining" | "limit" | "resetsAt">, now = Date.now()): QuotaLevel {
  if (q.remaining == null) return "unknown";
  // An exhausted quota whose reset time has passed is stale: allow the next send to find out the truth.
  if (q.remaining <= 0) return q.resetsAt != null && q.resetsAt <= now ? "unknown" : "exhausted";
  if (q.limit && q.limit > 0) return q.remaining / q.limit <= LOW_QUOTA_FRACTION ? "low" : "ok";
  return q.remaining <= LOW_QUOTA_ABSOLUTE ? "low" : "ok";
}
