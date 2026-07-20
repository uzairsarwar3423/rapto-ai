import { TeamIntegration } from '@prisma/client'
import { ProviderTokenResponse } from '../integrations.types'

/**
 * Provider.interface.ts — The shared contract every outbound integration provider implements.
 *
 * DESIGN RULE (Day 58 Principle 1): This file has ZERO provider-specific knowledge.
 * It is written to answer one question generically: what must any outbound
 * ticketing/messaging integration be able to do, regardless of which vendor it is?
 *
 * DESIGN RULE (Day 58 Principle 2): integrations.service.ts and integrate.worker.ts
 * depend ONLY on this interface and provider.registry.ts — never on concrete providers.
 * No caller ever imports a concrete provider directly.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared result types used across the interface
// ─────────────────────────────────────────────────────────────────────────────

export interface ProviderTestResult {
    healthy: boolean
    workspaceName?: string
}

/**
 * The normalized input shape every provider's createExternalItem() accepts.
 * The context sub-object carries meeting provenance so that every provider's
 * ticket/issue description can include it without callers needing to know
 * how (or whether) each provider renders it.
 *
 * Jira: renders context into ADF rich text.
 * Linear: renders context as a Markdown description.
 * Notion: renders context as page content.
 */
export interface CreateExternalItemInput {
    actionItemId: string
    text: string
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
    dueDate?: Date | null
    assigneeEmail?: string | null
    context: {
        meetingTitle: string
        meetingDate: Date
        transcriptExcerpt?: string | null
    }
    /** Provider-specific metadata (projectKey, defaultIssueType, etc.) */
    teamMetadata: Record<string, unknown>
}

/**
 * The normalized result every provider's createExternalItem() returns.
 * externalId is the provider's opaque identifier (e.g., Jira issue key "TECH-142").
 * externalUrl is the human-browsable URL to the created item.
 */
export interface ExternalItemResult {
    externalId: string
    externalUrl: string
}

// ─────────────────────────────────────────────────────────────────────────────
// The provider interface — every outbound integration implements this
// ─────────────────────────────────────────────────────────────────────────────

export interface IntegrationProvider {
    /**
     * Exchange an OAuth authorization code for access + refresh tokens.
     * Returns a normalized ProviderTokenResponse shape — hiding provider-
     * specific token response variance from all callers.
     */
    exchangeCodeForTokens(code: string): Promise<ProviderTokenResponse>

    /**
     * Refresh an expired access token using the encrypted refresh token.
     * NOTE: Some providers (Jira) reissue a NEW refresh token on every refresh.
     * The returned shape's optional refreshToken field handles this asymmetry:
     * callers must persist the new refresh token if present.
     */
    refreshAccessToken(
        refreshTokenEnc: string
    ): Promise<Omit<ProviderTokenResponse, 'workspaceMeta'>>

    /**
     * Lightweight connection-health check — used by /integrations/:provider/test endpoint.
     * MUST NOT perform expensive operations (no project lists, no bulk fetches).
     * Jira: GET /rest/api/3/myself
     */
    testConnection(integration: TeamIntegration): Promise<ProviderTestResult>

    /**
     * Best-effort token revocation, called during disconnect.
     * Implementations MUST swallow errors internally — disconnect must never fail
     * due to a revocation API being unavailable.
     */
    revokeToken(integration: TeamIntegration): Promise<void>

    /**
     * Create an external item (Jira issue, Linear issue, Notion page) from a
     * Vocaply action item. This is the core outbound integration operation.
     *
     * IDEMPOTENCY: implementations must be designed so that calling this method
     * twice with the same input either creates exactly one item or throws a
     * typed error — never silently creates duplicates.
     */
    createExternalItem?(
        integration: TeamIntegration,
        input: CreateExternalItemInput
    ): Promise<ExternalItemResult>

    /**
     * Optional: update the status of an already-created external item.
     * Marked optional because not every provider direction supports it
     * (Slack has no concept of "external item status").
     * Jira: POST /issue/{issueKey}/transitions → "Done"
     */
    updateExternalItemStatus?(
        integration: TeamIntegration,
        externalId: string,
        completed: boolean
    ): Promise<{ statusUpdated: boolean }>
}
