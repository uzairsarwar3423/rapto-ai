// ─────────────────────────────────────────────────────────────────────────────
// notifications.validator.ts — Zod schemas (strict, unknown-key-rejecting)
//
// Key design: z.strict() on the preferences update schema.
// A typo'd key like "emial.meetingSummary" MUST surface as a 422 — it must
// NEVER be silently stripped and make the user believe their preference was saved.
// This is a CORRECTNESS control for notify.worker (which reads specific dotted
// paths from preferences), not just a tidiness concern for today's endpoint.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod'

// ── Update Preferences Schema ─────────────────────────────────────────────────

const emailPrefsSchema = z
  .object({
    meetingSummary: z.boolean(),
    deadlineReminder: z.boolean(),
    commitmentMissed: z.boolean(),
    weeklyDigest: z.boolean(),
    paymentAlerts: z.boolean(),
  })
  .strict()  // unknown keys rejected with 422
  .partial() // all keys optional (PATCH semantics)

const slackPrefsSchema = z
  .object({
    meetingSummary: z.boolean(),
    deadlineReminder: z.boolean(),
    commitmentMissed: z.boolean(),
    dailyDigest: z.boolean(),
    personalDMs: z.boolean(),
  })
  .strict()
  .partial()

const inAppPrefsSchema = z
  .object({
    all: z.boolean(),
  })
  .strict()
  .partial()

export const updatePreferencesSchema = z
  .object({
    email: emailPrefsSchema.optional(),
    slack: slackPrefsSchema.optional(),
    inApp: inAppPrefsSchema.optional(),
  })
  .strict() // top-level unknown keys also rejected

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>

// ── List In-App Notifications Schema ──────────────────────────────────────────

export const listInAppNotificationsSchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 10)),
  cursor: z.string().optional(),
})

export type ListInAppNotificationsInput = z.infer<typeof listInAppNotificationsSchema>

// ── Welcome Email Schemas ───────────────────────────────────────────────────

export const ownerWelcomeSchema = z.object({
  to: z.string().email(),
  ownerName: z.string().min(1),
  workspaceName: z.string().min(1),
  dashboardUrl: z.string().url().optional(),
  checklist: z
    .array(
      z.object({
        step: z.number(),
        title: z.string(),
        description: z.string(),
        completed: z.boolean().optional(),
        actionUrl: z.string().optional(),
        actionLabel: z.string().optional(),
      })
    )
    .optional(),
  userId: z.string().optional(),
})

export type OwnerWelcomeInput = z.infer<typeof ownerWelcomeSchema>

export const teamMemberWelcomeSchema = z.object({
  to: z.string().email(),
  memberName: z.string().min(1),
  workspaceName: z.string().min(1),
  inviterName: z.string().min(1),
  role: z.string().min(1),
  dashboardUrl: z.string().url().optional(),
  capabilities: z
    .array(
      z.object({
        icon: z.string(),
        title: z.string(),
        description: z.string(),
      })
    )
    .optional(),
  userId: z.string().optional(),
})

export type TeamMemberWelcomeInput = z.infer<typeof teamMemberWelcomeSchema>


