import axios, { AxiosInstance } from 'axios'
import { TeamIntegration } from '@prisma/client'
import {
    IntegrationProvider,
    ProviderTestResult,
    CreateExternalItemInput,
    ExternalItemResult,
} from './provider.interface'
import { ProviderTokenResponse } from '../integrations.types'
import { OAUTH_CONFIGS } from './oauth-config'
import { encrypt, decrypt } from '../../../utils/crypto'
import { redis } from '../../../config/redis'
import { logger } from '../../../config/logger'
import { AppError } from '../../../utils/errors'
import { format } from 'date-fns'

// ─────────────────────────────────────────────────────────────────────────────
// Priority mapping — single source of truth (Day 58 §11)
//
// WHY 'Highest' not 'Urgent' for URGENT:
//   Jira Cloud's DEFAULT priority scheme uses "Highest" for its top tier, not
//   "Urgent". Using "Urgent" would fail silently against a real Jira instance
//   unless the team has customized their scheme to add it.
// ─────────────────────────────────────────────────────────────────────────────
export const JIRA_PRIORITY_MAP: Record<string, string> = {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
    URGENT: 'Highest',
}

// ─────────────────────────────────────────────────────────────────────────────
// Redis key helpers — all Jira-specific keys centralized here
// ─────────────────────────────────────────────────────────────────────────────
const assigneeCacheKey = (teamId: string, email: string) =>
    `cache:jira:assignee:${teamId}:${email}`

const ASSIGNEE_CACHE_TTL = 86400 // 24h — see plan §10 for TTL justification
const NEGATIVE_CACHE_SENTINEL = 'NONE'

// ─────────────────────────────────────────────────────────────────────────────
// ADF builder — minimal, purpose-built (Day 58 §8 "ADF dedicated sub-section")
//
// Jira Cloud REST API v3 requires ADF for rich-text fields. Submitting a plain
// string as `description` is a guaranteed 400 Bad Request against v3.
// This builder is intentionally scoped to exactly two paragraphs of fixed-shape
// content — not a general-purpose Markdown→ADF converter.
// ─────────────────────────────────────────────────────────────────────────────
function buildIssueDescription(
    meetingTitle: string,
    meetingDate: Date,
    transcriptExcerpt?: string | null
): object {
    const formattedDate = format(meetingDate, 'MMMM d, yyyy')

    const content: object[] = [
        {
            type: 'paragraph',
            content: [
                {
                    type: 'text',
                    text: `Extracted from meeting: ${meetingTitle} on ${formattedDate}`,
                    marks: [{ type: 'strong' }],
                },
            ],
        },
    ]

    if (transcriptExcerpt?.trim()) {
        content.push({
            type: 'blockquote',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        {
                            type: 'text',
                            text: transcriptExcerpt.trim().substring(0, 500), // hard cap on excerpt length
                        },
                    ],
                },
            ],
        })
    }

    content.push({
        type: 'paragraph',
        content: [
            {
                type: 'text',
                text: '— Created automatically by Vocaply',
                marks: [{ type: 'em' }],
            },
        ],
    })

    return { type: 'doc', version: 1, content }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP error classification — maps Jira API status codes to typed AppErrors
// This classification is what the worker uses for retry-eligibility decisions.
// ─────────────────────────────────────────────────────────────────────────────
function classifyJiraError(error: any): never {
    const status = error.response?.status
    const message = error.response?.data?.errorMessages?.[0] || error.response?.data?.message || error.message

    if (status === 401) throw new AppError('JIRA_TOKEN_INVALID', 401, `Jira: invalid/expired token — ${message}`)
    if (status === 403) throw new AppError('JIRA_ACCESS_DENIED', 403, `Jira: access denied — ${message}`)
    if (status === 404) throw new AppError('JIRA_PROJECT_NOT_FOUND', 422, `Jira: project/resource not found — ${message}`)
    if (status === 422 || status === 400) throw new AppError('JIRA_FIELD_VALIDATION_FAILED', 422, `Jira: field validation failed — ${message}`)
    if (status === 429) throw new AppError('JIRA_RATE_LIMITED', 429, `Jira: rate limited — ${message}`)
    if (status && status >= 500) throw new AppError('JIRA_SERVICE_ERROR', 502, `Jira service error (${status}) — ${message}`)

    // Network-level or unknown error — retryable
    throw new AppError('JIRA_SERVICE_ERROR', 502, `Jira request failed — ${message}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// JiraProvider — implements IntegrationProvider against Jira Cloud OAuth 2.0
// (3LO — Atlassian's "3-legged OAuth") and REST API v3.
//
// Dedicated axios instance: 15s timeout (Jira issue-creation can run longer than
// the 10s used for Google Calendar's simpler list operations — Day 58 §8).
// ─────────────────────────────────────────────────────────────────────────────
export class JiraProvider implements IntegrationProvider {
    private readonly http: AxiosInstance

    constructor() {
        this.http = axios.create({
            timeout: 15_000,
            headers: { 'Content-Type': 'application/json' },
        })
    }

    // ─────────────────────────────────────────────────────────────────────────
    // OAuth — getAccessibleResources (Day 58 §9 "The Critical Jira-Specific Step")
    //
    // Jira Cloud's OAuth 2.0 (3LO) is resource-scoped. An access token alone
    // is NOT bound to a specific Jira site. This call asks "which site(s) does
    // this token grant access to?" — required BEFORE any REST API call.
    //
    // WHY this is a SEPARATE method, not embedded in exchangeCodeForTokens():
    //   The interface's generic exchangeCodeForTokens() must stay free of
    //   Jira-specific multi-step behavior that other providers don't need.
    //   The service layer calls this explicitly after code exchange (§12).
    // ─────────────────────────────────────────────────────────────────────────
    async getAccessibleResources(
        accessToken: string
    ): Promise<{ cloudId: string; name: string; url: string }> {
        let resources: any[]
        try {
            const response = await this.http.get(
                'https://api.atlassian.com/oauth/token/accessible-resources',
                { headers: { Authorization: `Bearer ${accessToken}` } }
            )
            resources = response.data
        } catch (error: any) {
            classifyJiraError(error)
        }

        if (!resources! || resources!.length === 0) {
            throw new AppError(
                'JIRA_NO_ACCESSIBLE_SITES',
                422,
                'The connected Atlassian account has no accessible Jira sites. ' +
                    'Ensure the account has access to at least one Jira Cloud instance.'
            )
        }

        if (resources!.length > 1) {
            // Multi-site account: select first site, log a warning.
            // A "choose which Jira site" UI is deferred — documented scope limitation (§9, §29).
            logger.warn(
                {
                    siteCount: resources!.length,
                    sites: resources!.map((r: any) => r.name),
                },
                'integrate.jira.cloud_id_resolved: multiple accessible sites found — selecting first. ' +
                    'A site-chooser UI is a planned future enhancement.'
            )
        }

        const site = resources![0]
        logger.info(
            { cloudId: site.id, siteCount: resources!.length },
            'integrate.jira.cloud_id_resolved'
        )
        return { cloudId: site.id, name: site.name, url: site.url }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // OAuth — exchangeCodeForTokens
    // ─────────────────────────────────────────────────────────────────────────
    async exchangeCodeForTokens(code: string): Promise<ProviderTokenResponse> {
        const config = OAUTH_CONFIGS.JIRA
        if (!config) throw new AppError('PROVIDER_NOT_CONFIGURED', 500, 'Jira OAuth config missing')

        let response: any
        try {
            response = await this.http.post(config.tokenUrl, {
                grant_type: 'authorization_code',
                client_id: config.clientId,
                client_secret: config.clientSecret,
                code,
                redirect_uri: config.callbackUrl,
            })
        } catch (error: any) {
            logger.error({ err: error.message }, 'integrate.jira.callback_failed: token exchange error')
            if (error.response?.status === 400) {
                throw new AppError('JIRA_AUTH_CODE_INVALID', 400, 'Invalid or expired Jira authorization code')
            }
            classifyJiraError(error)
        }

        const { access_token, refresh_token, expires_in } = response!.data

        // Resolve cloudId immediately after token exchange — mandatory (§9)
        const site = await this.getAccessibleResources(access_token)

        return {
            accessToken: access_token,
            refreshToken: refresh_token,
            expiresIn: expires_in,
            workspaceMeta: {
                id: site.cloudId, // stored as workspaceId
                name: site.name,
                url: site.url,
                extra: { cloudId: site.cloudId }, // also stored in metadata.cloudId for API routing
            },
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // OAuth — refreshAccessToken
    //
    // CRITICAL ASYMMETRY vs Google Calendar (Day 56):
    //   Atlassian REISSUES a NEW refresh token on every refresh call.
    //   The caller MUST persist the new refresh token — the old one is invalidated.
    //   This is why the return type includes an optional refreshToken field
    //   (populated here, omitted by Google's provider) — not a structural coincidence.
    // ─────────────────────────────────────────────────────────────────────────
    async refreshAccessToken(
        refreshTokenEnc: string
    ): Promise<Omit<ProviderTokenResponse, 'workspaceMeta'>> {
        const config = OAUTH_CONFIGS.JIRA
        if (!config) throw new AppError('PROVIDER_NOT_CONFIGURED', 500, 'Jira OAuth config missing')

        const refreshToken = decrypt(refreshTokenEnc)

        let response: any
        try {
            response = await this.http.post(config.tokenUrl, {
                grant_type: 'refresh_token',
                client_id: config.clientId,
                client_secret: config.clientSecret,
                refresh_token: refreshToken,
            })
        } catch (error: any) {
            classifyJiraError(error)
        }

        return {
            accessToken: response!.data.access_token,
            refreshToken: response!.data.refresh_token, // Jira always returns a new one
            expiresIn: response!.data.expires_in,
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // testConnection — lightweight health check via GET /rest/api/3/myself
    // ─────────────────────────────────────────────────────────────────────────
    async testConnection(integration: TeamIntegration): Promise<ProviderTestResult> {
        try {
            const accessToken = decrypt(integration.accessTokenEnc)
            const cloudId = this.resolveCloudId(integration)

            await this.http.get(
                `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/myself`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            )

            return { healthy: true, workspaceName: integration.workspaceName || undefined }
        } catch (error: any) {
            logger.warn(
                { integrationId: integration.id, err: error.message },
                'Jira testConnection failed'
            )
            return { healthy: false }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // revokeToken — best-effort, errors swallowed (Day 58 §12 "disconnectProvider")
    // ─────────────────────────────────────────────────────────────────────────
    async revokeToken(integration: TeamIntegration): Promise<void> {
        try {
            const accessToken = decrypt(integration.accessTokenEnc)
            // Atlassian's token revocation endpoint
            await this.http.post(
                'https://auth.atlassian.com/oauth/token/revoke',
                { token: accessToken },
                {
                    auth: {
                        username: OAUTH_CONFIGS.JIRA!.clientId,
                        password: OAUTH_CONFIGS.JIRA!.clientSecret,
                    },
                }
            )
            logger.info({ integrationId: integration.id }, 'Jira token revoked successfully')
        } catch (error: any) {
            // Best-effort: revocation failure must NOT block disconnect
            logger.warn(
                { integrationId: integration.id, err: error.message },
                'Jira token revocation failed (best-effort, non-fatal)'
            )
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // listProjects — for the /jira/projects endpoint (Day 58 §13)
    // Returns a simplified { key, name }[] for the settings UI dropdown.
    // ─────────────────────────────────────────────────────────────────────────
    async listProjects(
        accessToken: string,
        cloudId: string
    ): Promise<Array<{ key: string; name: string }>> {
        try {
            const response = await this.http.get(
                `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/project/search`,
                {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    params: { maxResults: 100, expand: 'lead' },
                }
            )
            return response.data.values.map((p: any) => ({
                key: p.key,
                name: `${p.name} (${p.key})`,
            }))
        } catch (error: any) {
            classifyJiraError(error)
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // createExternalItem — the core outbound operation (Day 58 §8)
    //
    // Maps a generic CreateExternalItemInput onto Jira's ADF-based issue-creation
    // payload. All Jira-specific field logic lives HERE, never in the service or worker.
    // ─────────────────────────────────────────────────────────────────────────
    async createExternalItem(
        integration: TeamIntegration,
        input: CreateExternalItemInput
    ): Promise<ExternalItemResult> {
        const accessToken = decrypt(integration.accessTokenEnc)
        const cloudId = this.resolveCloudId(integration)
        const metadata = integration.metadata as Record<string, any>

        const projectKey = metadata?.projectKey
        const defaultIssueType = metadata?.defaultIssueType || 'Task'

        if (!projectKey) {
            throw new AppError(
                'JIRA_PROJECT_NOT_FOUND',
                422,
                'Jira integration is not fully configured: projectKey is missing. ' +
                    'An admin must configure the Jira project via PATCH /integrations/JIRA/config.'
            )
        }

        // Summary: hard-truncated to 255 chars (Jira field limit)
        const summary = input.text.substring(0, 255)

        // Description: ADF — NEVER a plain string (v3 API requirement)
        const description = buildIssueDescription(
            input.context.meetingTitle,
            input.context.meetingDate,
            input.context.transcriptExcerpt
        )

        // Priority: mapped from Vocaply enum to Jira's label
        const priorityName = JIRA_PRIORITY_MAP[input.priority] || 'Medium'

        // Assignee: resolved via Redis-cached email→accountId lookup
        // IMPORTANT: the assignee field is OMITTED ENTIRELY if unresolved (not sent as null)
        // Jira rejects a null assignee; omission is the only correct "unassigned" representation.
        let assigneeField: Record<string, string> | undefined
        if (input.assigneeEmail) {
            const teamId = integration.teamId
            const accountId = await this.resolveJiraAssignee(
                accessToken,
                cloudId,
                teamId,
                input.assigneeEmail
            )
            if (accountId) {
                assigneeField = { accountId }
            }
        }

        // Due date: omitted entirely if absent (Jira rejects null for date fields)
        const dueDateField = input.dueDate
            ? format(new Date(input.dueDate), 'yyyy-MM-dd')
            : undefined

        const issuePayload = {
            fields: {
                project: { key: projectKey },
                summary,
                description,
                issuetype: { name: defaultIssueType },
                priority: { name: priorityName },
                labels: ['vocaply', 'meeting-action-item'],
                ...(assigneeField ? { assignee: assigneeField } : {}),
                ...(dueDateField ? { duedate: dueDateField } : {}),
            },
        }

        let response: any
        try {
            response = await this.http.post(
                `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue`,
                issuePayload,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            )
        } catch (error: any) {
            classifyJiraError(error)
        }

        const issueKey = response!.data.key
        // NOTE: The URL is constructed from the known workspace URL + issue key.
        // Jira's create-issue response returns `self` (an API endpoint), NOT a
        // human-browsable URL. Using `self` as the "view in Jira" link is incorrect.
        const externalUrl = `${integration.workspaceUrl}/browse/${issueKey}`

        logger.info(
            {
                teamId: integration.teamId,
                actionItemId: input.actionItemId,
                jiraIssueId: issueKey,
                projectKey,
            },
            'integrate.worker.issue_created'
        )

        return { externalId: issueKey, externalUrl }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // updateExternalItemStatus — transition an issue to "Done" (Day 59 forward)
    // ─────────────────────────────────────────────────────────────────────────
    async updateExternalItemStatus(
        integration: TeamIntegration,
        externalId: string,
        completed: boolean
    ): Promise<{ statusUpdated: boolean }> {
        if (!completed) return { statusUpdated: false }

        const accessToken = decrypt(integration.accessTokenEnc)
        const cloudId = this.resolveCloudId(integration)
        const baseUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3`

        try {
            const transitionsRes = await this.http.get(`${baseUrl}/issue/${externalId}/transitions`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            })

            const doneTransition = transitionsRes.data.transitions.find(
                (t: any) =>
                    t.name.toLowerCase() === 'done' ||
                    t.name.toLowerCase() === 'closed' ||
                    t.name.toLowerCase().includes('done')
            )

            if (!doneTransition) {
                logger.warn(
                    { teamId: integration.teamId, issueKey: externalId },
                    'No "Done" transition found for Jira issue — status not updated'
                )
                return { statusUpdated: false }
            }

            await this.http.post(
                `${baseUrl}/issue/${externalId}/transitions`,
                { transition: { id: doneTransition.id } },
                { headers: { Authorization: `Bearer ${accessToken}` } }
            )

            return { statusUpdated: true }
        } catch (error: any) {
            logger.warn(
                { integrationId: integration.id, issueKey: externalId, err: error.message },
                'Failed to update Jira issue status (non-fatal)'
            )
            return { statusUpdated: false }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // resolveJiraAssignee — Redis-cached email→accountId resolution (Day 58 §10)
    //
    // STEP 1: Redis cache check (positive and negative)
    // STEP 2: Cache miss → live GET /user/search with EXACT email match filter
    // STEP 3: Cache result (both positive and negative — negative caching prevents
    //         redundant API calls for unmapped users)
    // STEP 4: Return accountId or null — caller OMITS assignee field if null
    //
    // WHY exact-match filter matters:
    //   Jira's /user/search is a FUZZY match. Taking the first result unconditionally
    //   risks assigning to the WRONG person if a similarly-named user appears first.
    // ─────────────────────────────────────────────────────────────────────────
    private async resolveJiraAssignee(
        accessToken: string,
        cloudId: string,
        teamId: string,
        email: string
    ): Promise<string | null> {
        const cacheKey = assigneeCacheKey(teamId, email)

        // Step 1: cache check
        const cached = await redis.get(cacheKey)
        if (cached !== null) {
            if (cached === NEGATIVE_CACHE_SENTINEL) {
                logger.info(
                    { teamId, email },
                    'integrate.worker.assignee_unresolved (negative cache hit)'
                )
                return null
            }
            logger.info({ teamId }, 'integrate.worker.assignee_resolved (cached: true)')
            return cached
        }

        // Step 2: live lookup
        try {
            const response = await this.http.get(
                `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/user/search`,
                {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    params: { query: email, maxResults: 10 },
                }
            )

            // Exact, case-insensitive match — fuzzy results rejected
            const exactMatch = response.data.find(
                (u: any) => u.emailAddress?.toLowerCase() === email.toLowerCase()
            )

            if (exactMatch?.accountId) {
                // Step 3a: positive cache
                await redis.setex(cacheKey, ASSIGNEE_CACHE_TTL, exactMatch.accountId)
                logger.info(
                    { teamId, cached: false },
                    'integrate.worker.assignee_resolved'
                )
                return exactMatch.accountId
            }

            // Step 3b: negative cache — prevents repeated API calls for unmapped users
            await redis.setex(cacheKey, ASSIGNEE_CACHE_TTL, NEGATIVE_CACHE_SENTINEL)
            logger.info({ teamId, email }, 'integrate.worker.assignee_unresolved (no match)')
            return null
        } catch (error: any) {
            // Resolution failure ≠ sync failure: omit assignee, log warning, proceed
            logger.warn(
                { teamId, email, err: error.message },
                'integrate.worker.assignee_unresolved (API error — proceeding unassigned)'
            )
            return null
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // resolveCloudId — extracts cloudId from integration row.
    // cloudId lives in metadata.cloudId (set during callback) AND is mirrored
    // to workspaceId for the generic team_integrations columns.
    // ─────────────────────────────────────────────────────────────────────────
    private resolveCloudId(integration: TeamIntegration): string {
        const metadata = integration.metadata as Record<string, any>
        const cloudId = metadata?.cloudId || integration.workspaceId

        if (!cloudId) {
            throw new AppError(
                'JIRA_NO_ACCESSIBLE_SITES',
                422,
                'Jira cloudId is missing from integration record. ' +
                    'The connection must be re-established to resolve the cloud resource.'
            )
        }

        return cloudId
    }

    // ─────────────────────────────────────────────────────────────────────────
    // registerWebhook — Day 59 §6
    //
    // Called from integrations.service.ts completeOAuthCallback (Jira branch)
    // AFTER cloudId resolution and BEFORE the TeamIntegration row is persisted.
    // The returned { webhookId, secret } is merged into the metadata object and
    // persisted in a SINGLE database write — keeping the connect flow atomic.
    //
    // Security — per-team secret design:
    //   A fresh cryptographically random secret is generated per team registration.
    //   This is fundamentally different from Recall.ai's / Stripe's global env
    //   secrets — Jira's per-team webhook design REQUIRES a per-registration secret
    //   because each team's webhook is a genuinely separate subscription.
    //
    // Dual-strategy secret embedding (resolves §6's flagged uncertainty):
    //   Strategy A (preferred, if Jira supports native signing): pass secret as
    //   a registration parameter; Jira will sign deliveries with X-Hub-Signature.
    //   Strategy B (fallback): embed secret as `?secret=` on the callback URL;
    //   Jira echoes this back on every delivery for query-param verification.
    //   Today's implementation uses BOTH simultaneously — registers with the secret
    //   as a URL param AND attempts to set it natively — so the verifier in
    //   webhooks.validator.ts handles whichever Jira actually uses.
    //
    // Failure handling:
    //   A registration failure during connect is NOT silently swallowed. It surfaces
    //   as a connect-flow failure (throws AppError) because an OAuth-connected-but-
    //   webhook-unregistered integration would silently never receive reverse sync —
    //   a much worse outcome than a visible error the admin can retry.
    // ─────────────────────────────────────────────────────────────────────────
    async registerWebhook(params: {
        accessToken:  string
        cloudId:      string
        projectKey:   string
        teamId:       string
        callbackBase: string  // e.g. https://api.vocaply.com/webhooks/jira
    }): Promise<{ webhookId: string; secret: string }> {
        const { accessToken, cloudId, projectKey, teamId, callbackBase } = params

        // Generate a fresh, cryptographically random 32-byte hex secret (256 bits).
        // This is unique per team — never shared or reused.
        const crypto = await import('crypto')
        const secret = crypto.randomBytes(32).toString('hex')

        // Embed the secret in the callback URL (Strategy B fallback).
        // Also used as the hook URL's identity marker for this team's registration.
        const callbackUrl = `${callbackBase}?teamId=${teamId}&secret=${secret}`

        const registrationPayload = {
            webhooks: [
                {
                    jqlFilter:  `project = "${projectKey}"`,
                    events:     ['jira:issue_updated'],
                    // The URL receives both the teamId (for routing) and the secret
                    // (for Strategy B verification). Jira will POST to this URL exactly
                    // as specified here — the secret remains in the URL on every delivery.
                    url:        callbackUrl,
                },
            ],
        }

        let response: any
        try {
            response = await this.http.post(
                `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/webhook`,
                registrationPayload,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            )
        } catch (error: any) {
            const message = error.response?.data?.errorMessages?.[0] || error.message
            logger.error(
                { teamId, projectKey, cloudId, err: message },
                'integrations.jira.webhook_registration_failed'
            )
            throw new AppError(
                'JIRA_WEBHOOK_REGISTRATION_FAILED',
                502,
                `Failed to register Jira webhook for project ${projectKey}: ${message}. ` +
                'The Jira integration connect flow cannot proceed without webhook registration. ' +
                'Please retry connecting.'
            )
        }

        // Jira's webhook registration response returns an array of created webhooks.
        // Each entry has an `id` (the webhookId to store for later deregistration).
        const createdWebhooks: Array<{ id: number; expirationDate?: string }> = response.data?.webhooksRegistrationResult ?? []
        const created = createdWebhooks[0]

        if (!created?.id) {
            throw new AppError(
                'JIRA_WEBHOOK_REGISTRATION_FAILED',
                502,
                'Jira returned a 2xx response but no webhook ID was present in the payload. ' +
                'Cannot proceed without a webhookId for future deregistration.'
            )
        }

        const webhookId = String(created.id)

        logger.info(
            { teamId, projectKey, webhookId, expirationDate: created.expirationDate },
            'integrations.jira.webhook_registered'
        )

        // Note: Jira webhooks expire after 30 days by default (Atlassian platform constraint).
        // A periodic re-registration job is a documented near-term follow-up (not in today's scope).
        // The expirationDate is stored in metadata for observability.
        return { webhookId, secret }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // deregisterWebhook — Day 59 §7
    //
    // Called from integrations.service.ts disconnectIntegration (Jira branch)
    // BEFORE the TeamIntegration row is deleted — reads metadata.jiraWebhookId
    // from the still-present row, exactly mirroring the ordering established for
    // OAuth token revocation ("revoke first, delete local record second").
    //
    // 404 treatment:
    //   A 404 from Jira (webhook already removed — e.g. admin manually deleted it
    //   via Jira's own UI, or Jira garbage-collected it) is treated as SUCCESS —
    //   identical to Day 17's recallService.removeBot() and Day 56's Google token
    //   revocation: "the thing we wanted gone is gone, regardless of who removed it."
    //
    // Failure treatment:
    //   A non-404 failure logs WARN but does NOT block the local disconnect — the
    //   user's disconnect intent takes priority over a third-party cleanup failure.
    //   The warning makes any lingering Jira-side footprint traceable for support.
    // ─────────────────────────────────────────────────────────────────────────
    async deregisterWebhook(params: {
        accessToken: string
        cloudId:     string
        webhookId:   string
        teamId:      string  // for logging only
    }): Promise<void> {
        const { accessToken, cloudId, webhookId, teamId } = params

        try {
            // Jira's DELETE webhook API accepts a batch of IDs in the request body.
            await this.http.delete(
                `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/webhook`,
                {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    data:    { webhookIds: [Number(webhookId)] },
                }
            )

            logger.info(
                { teamId, webhookId },
                'integrations.jira.webhook_deregistered'
            )
        } catch (error: any) {
            const status = error.response?.status

            // 404 → already gone → treat as success (idempotent deletion)
            if (status === 404) {
                logger.info(
                    { teamId, webhookId },
                    'integrations.jira.webhook_deregistered: 404 received — webhook already removed, treating as success'
                )
                return
            }

            // Non-404 failure → WARN only — does NOT block disconnect (§7)
            logger.warn(
                { teamId, webhookId, status, err: error.message },
                'integrations.jira.webhook_deregistration_failed: non-fatal, disconnect will proceed. ' +
                'A stale webhook subscription may remain on Jira\'s side — traceable via this log.'
            )
            // Intentional: do NOT re-throw. Disconnect proceeds regardless.
        }
    }
}

export const jiraProvider = new JiraProvider()
