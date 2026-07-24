// ─────────────────────────────────────────────────────────────────────────────
// notification-dedup.config.ts — Notification Deduplication TTL Constants
// ─────────────────────────────────────────────────────────────────────────────

export const NOTIFICATION_DEDUP_TTL = {
  COMMITMENT_MISSED: 86400,     // 24 hours
  DEADLINE_REMINDER: 86400,     // 24 hours
  COMMITMENT_FULFILLED: 3600,   // 1 hour
  MEETING_PROCESSED: 86400,     // 24 hours
} as const

export type NotificationDedupType = keyof typeof NOTIFICATION_DEDUP_TTL
