// ─────────────────────────────────────────────────────────────────────────────
// notifications.types.ts — Notification Types & Preferences Interfaces
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The full JSONB shape stored in notification_preferences.preferences.
 * Every field is a boolean toggle.
 */
export interface NotificationPreferences {
  email: {
    meetingSummary: boolean
    deadlineReminder: boolean
    commitmentMissed: boolean
    commitmentFulfilled: boolean
    weeklyDigest: boolean
    paymentAlerts: boolean
  }
  slack: {
    meetingSummary: boolean
    deadlineReminder: boolean
    commitmentMissed: boolean
    commitmentFulfilled: boolean
    dailyDigest: boolean
    personalDMs: boolean
  }
  inApp: {
    all: boolean
  }
}

/**
 * Partial variant accepted by PATCH /notifications/preferences.
 * Every nested key is optional — the service performs a true deep merge.
 */
export interface PartialNotificationPreferences {
  email?: Partial<NotificationPreferences['email']>
  slack?: Partial<NotificationPreferences['slack']>
  inApp?: Partial<NotificationPreferences['inApp']>
}

/**
 * The system-level default preferences returned when no row exists yet.
 * Returned as a READ-ONLY fallback — never written to DB on a read-miss.
 */
export const DEFAULT_PREFERENCES: NotificationPreferences = {
  email: {
    meetingSummary: true,
    deadlineReminder: true,
    commitmentMissed: true,
    commitmentFulfilled: true,
    weeklyDigest: true,
    paymentAlerts: true,
  },
  slack: {
    meetingSummary: true,
    deadlineReminder: true,
    commitmentMissed: true,
    commitmentFulfilled: true,
    dailyDigest: false,
    personalDMs: true,
  },
  inApp: {
    all: true,
  },
}

// ── Block Kit Input Types (Pure Data Structures) ─────────────────────────────

export interface CommitmentMissedBlockInput {
  id: string
  text: string
  dueDateRaw?: string | null
  dueDate?: Date | null
  actionUrl: string
}

export interface ManagerAlertBlockInput {
  id: string
  text: string
  ownerName: string
  commitmentScore?: number | null
  profileUrl: string
}

export interface DeadlineReminderBlockInput {
  id: string
  text: string
  dueDateRaw?: string | null
  dueDate?: Date | null
  actionUrl: string
}

export interface CommitmentFulfilledBlockInput {
  id: string
  text: string
  ownerName: string
  actionUrl: string
}

export interface ManagerFanOutResult {
  sent: number
  skipped: number
  failed: number
}
