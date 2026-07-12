import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Generic provider param schemas
// ─────────────────────────────────────────────────────────────────────────────

export const providerParamSchema = {
    params: z.object({
        provider: z.enum(['JIRA', 'LINEAR', 'SLACK', 'NOTION'], {
            message: 'INVALID_PROVIDER',
        }),
    }),
}

export const calendarProviderParamSchema = {
    params: z.object({
        provider: z.enum(['GOOGLE_CALENDAR', 'OUTLOOK_CALENDAR'], {
            message: 'INVALID_PROVIDER',
        }),
    }),
}

export const callbackQuerySchema = {
    query: z.object({
        code: z.string().min(1, 'Code is required').optional(),
        state: z.string().min(32, 'State must be at least 32 characters'),
        error: z.string().optional(),
    }),
    params: z.object({
        provider: z.enum(['JIRA', 'LINEAR', 'SLACK', 'NOTION'], {
            message: 'INVALID_PROVIDER',
        }),
    }),
}

// ─────────────────────────────────────────────────────────────────────────────
// Jira-specific schemas (Day 58 §13)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * jiraCallbackQuerySchema — validates the Atlassian OAuth callback query params.
 * state: min 32 chars (Atlassian state tokens are at least 32 hex chars).
 * error: optional — Atlassian sends an `error` param when the user denies consent.
 */
export const jiraCallbackQuerySchema = {
    query: z.object({
        code: z.string().min(1, 'Authorization code is required').optional(),
        state: z.string().min(32, 'State must be at least 32 characters'),
        error: z.string().optional(),
    }),
}

/**
 * configureJiraBodySchema — validates PATCH /integrations/jira/configure.
 *
 * projectKey format: Jira project keys are uppercase letters and numbers,
 * 2–10 characters (e.g. "TECH", "VOCAPLY1"). The regex enforces this exactly.
 *
 * defaultIssueType: freeform string — validated at the Jira API level.
 * Common values: 'Task', 'Story', 'Bug'. A live /issuetype fetch per project
 * is deferred as a future enhancement (§17).
 *
 * defaultPriority: validated against Vocaply's own PriorityLevel enum — NOT
 * a Jira-specific duplicate enum. Consistency with the platform's own types
 * is the design intent here.
 */
export const configureJiraBodySchema = {
    body: z.object({
        projectKey: z
            .string()
            .min(2, 'Project key must be at least 2 characters')
            .max(10, 'Project key cannot exceed 10 characters')
            .regex(
                /^[A-Z][A-Z0-9]+$/,
                'Project key must start with a letter and contain only uppercase letters and numbers (e.g. TECH, PROJ1)'
            ),
        defaultIssueType: z
            .string()
            .min(1, 'Issue type is required')
            .max(50, 'Issue type is too long'),
        defaultPriority: z
            .enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'], {
                message: 'Priority must be one of: LOW, MEDIUM, HIGH, URGENT',
            })
            .optional(),
    }),
}

/**
 * Generic config update schema — wraps arbitrary config object.
 * Used by PATCH /:provider/config for non-Jira providers.
 */
export const updateConfigBodySchema = {
    body: z.object({
        config: z.record(z.string(), z.unknown()),
    }),
}
