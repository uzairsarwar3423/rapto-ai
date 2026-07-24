/**
 * IntegrateJobData — the finalized job shape for the 'integrate' BullMQ queue.
 *
 * Design decisions:
 *   - `provider` is widened to include SLACK (Day 60) alongside the original
 *     JIRA/LINEAR/NOTION — the worker branching already handles all four.
 *   - `idempotencyKey` is REQUIRED (not optional). POST /:id/sync forces callers
 *     to supply this — the queue accepts it here without enforcement so that
 *     internal enqueue calls (e.g. from updateActionItem's completion handler)
 *     can omit it safely, falling back to a uuid-generated key in the worker.
 *   - `meetingId` is included for observability context in structured logs.
 */
export interface IntegrateJobData {
    /** The team owning this action item — used for integration lookup */
    teamId: string
    /** The Vocaply action item to sync externally */
    actionItemId: string
    /** The provider to sync to — must match a registered TeamProvider */
    provider: 'JIRA' | 'LINEAR' | 'NOTION' | 'SLACK'
    /**
     * Client-supplied idempotency key.
     * Purpose: prevent duplicate Jira tickets if the same job is enqueued twice
     * (e.g. user double-clicks "Sync to Jira"). The worker checks Redis for this
     * key before performing any work (Day 58 §14, Step 1).
     */
    idempotencyKey?: string
    /** Optional: meeting ID for structured log context */
    meetingId?: string
    /**
     * Optional provenance trigger source ('manual' | 'auto').
     * OBSERVABILITY & PROVENANCE RECORDING ONLY — NEVER read by any conditional
     * statement that would alter sync mechanics, retries, or health tracking.
     */
    source?: 'manual' | 'auto'
}

