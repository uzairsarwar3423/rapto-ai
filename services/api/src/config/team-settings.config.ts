import { z } from 'zod'

/**
 * AutoSyncProvider — restricted subset of TeamProvider.
 * Deliberately excludes SLACK since Slack is a notification channel, not a ticket destination.
 */
export type AutoSyncProvider = 'JIRA' | 'LINEAR' | 'NOTION'

export const autoSyncProviderEnum = z.enum(['JIRA', 'LINEAR', 'NOTION'])

export const teamSettingsSchema = z.object({
  defaultTimezone: z.string().default('UTC'),
  weeklyDigestEnabled: z.boolean().default(true),
  weeklyDigestDay: z.enum(['MONDAY', 'FRIDAY', 'SUNDAY']).default('MONDAY'),
  allowMembersToInvite: z.boolean().default(false),
  customBotName: z.string().max(50).optional(),
  autoSyncEnabled: z.boolean().default(false),
  autoSyncProviders: z.array(autoSyncProviderEnum).max(3).default([]),
})

export type TeamSettings = z.infer<typeof teamSettingsSchema>

export const DEFAULT_TEAM_SETTINGS: TeamSettings = {
  defaultTimezone: 'UTC',
  weeklyDigestEnabled: true,
  weeklyDigestDay: 'MONDAY',
  allowMembersToInvite: false,
  autoSyncEnabled: false,
  autoSyncProviders: [],
}
