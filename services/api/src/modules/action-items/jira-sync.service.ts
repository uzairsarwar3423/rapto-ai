// ─────────────────────────────────────────────────────────────────────────────
// jira-sync.service.ts — Day 59: Jira Reverse-Sync Business Logic
//
// ARCHITECTURAL ROLE:
//   This service is the ONLY place where Jira inbound webhook data results in
//   actual writes to Vocaply's database. jira.webhook.ts is a thin translator;
//   all decisions live here.
//
// DESIGN PRINCIPLES IMPLEMENTED:
//   §2 P1 — "The Webhook Handler Translates, It Never Decides"
//   §2 P2 — "Nothing in the Payload Is Trusted for Authorization"
//   §9     — Full 8-step handleStatusChange() sequence
//   §13    — teamId is advisory — real authorization is via DB lookup
//   §14    — Commitment cascade: auto-fulfil linked commitment on completion
//   §15    — Status name mapping (fixed set, documented limitation)
//   §18    — Security: cross-tenant explicit check, null completedById
//   §19    — Performance: no queue (human-paced volume), sync processing
//   §20    — Reliability: all failure modes handled non-fatally
//   §21    — Observability: all 8 structured log events present
// ─────────────────────────────────────────────────────────────────────────────

import { logger }                    from '../../config/logger'
import { getIO }                     from '../../realtime/socket.server'
import { SERVER_EVENTS }             from '../../realtime/socket.events'
import { teamRoom }                  from '../../realtime/rooms.manager'
import { integrationsRepository }    from '../integrations/integrations.repository'
import { actionItemsRepository }     from './action-items.repository'
import { prisma }                    from '../../db/client'
import { calculateCommitmentScore }  from '../../services/score.service'

// ─────────────────────────────────────────────────────────────────────────────
// Status Name Mapping — Day 59 §15
//
// Fixed set matching Jira Cloud's DEFAULT workflow statuses. Covers the
// overwhelming majority of real-world teams with no configuration burden.
//
// KNOWN LIMITATION (documented, not silently ignored):
//   Teams with custom workflow status names (e.g. "Shipped", "QA Passed",
//   "Deployed") will not trigger the cascade. This is a benign no-op, not
//   an error. Near-term follow-up: store metadata.completedStatusNames per
//   team and read from `integration.metadata.completedStatusNames ?? DEFAULT_COMPLETED_STATUS_NAMES`.
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_COMPLETED_STATUS_NAMES = new Set(['Done', 'Closed', 'Resolved'])

// ─────────────────────────────────────────────────────────────────────────────
// Input type for handleStatusChange() — deliberately narrow.
// The webhook handler passes ONLY what the service needs, not the full
// Jira payload. This keeps the service testable without an Express server.
// ─────────────────────────────────────────────────────────────────────────────
export interface JiraStatusChangeInput {
  /** teamId from the webhook URL query param — advisory, verified by DB lookup */
  teamId:        string
  /** Jira issue key (e.g. "TECH-142") — stored in action_items.jira_issue_id */
  jiraIssueKey:  string
  /** The `toString` value of the status changelog entry — e.g. "Done", "In Progress" */
  newStatusName: string
}

// ─────────────────────────────────────────────────────────────────────────────
// handleStatusChange — Day 59 §9
//
// Full 8-step sequence:
//   Step 1 — Defensive tenant verification (THE security-critical step)
//   Step 2 — Resolve action item by Jira issue key
//   Step 3 — Explicit cross-tenant check (defense in depth)
//   Step 4 — Status name → isNowComplete boolean
//   Step 5 — No-op short-circuit (idempotency at the business-logic level)
//   Step 6 — Persist system-attributed update (completedById: null)
//   Step 7 — Real-time Socket.io emission with source: 'jira'
//   Step 8 — Commitment cascade (conditional, see §14)
// ─────────────────────────────────────────────────────────────────────────────
export async function handleStatusChange(input: JiraStatusChangeInput): Promise<void> {
  const { teamId, jiraIssueKey, newStatusName } = input

  // ── STEP 1: Defensive Tenant Verification (§9 Step 1, §13) ────────────────
  // This is the single most security-critical step in this entire function.
  // teamId from the query param is advisory — this DB lookup is authoritative.
  // An active integration MUST exist for this teamId to proceed.
  //
  // A stale event (Jira still sending after deregistration) or a probing request
  // with a guessed teamId both result in a silent WARN + return — never an error
  // that could leak information about which teamIds are valid.
  const integration = await integrationsRepository.findByTeamAndProvider(teamId, 'JIRA')

  if (!integration || !integration.isActive) {
    logger.warn(
      { teamId, jiraIssueKey, hasIntegration: !!integration },
      'webhook.jira.unknown_team: no active Jira integration for this teamId — ignoring event'
    )
    return
  }

  // Per-team configurable completedStatusNames — fall back to the fixed default set.
  // This is the forward-compatibility hook described in §15's "near-term follow-up" design:
  // metadata.completedStatusNames can be set via PATCH /integrations/JIRA/config today,
  // and this handler will use it automatically, with zero code changes needed here.
  const meta = (integration.metadata as Record<string, any>) ?? {}
  const completedStatusNames: Set<string> = meta.completedStatusNames
    ? new Set<string>(meta.completedStatusNames as string[])
    : DEFAULT_COMPLETED_STATUS_NAMES

  // ── STEP 2: Resolve Action Item (§9 Step 2) ────────────────────────────────
  // Uses the unique partial index idx_ai_jira_issue for a sub-ms point lookup.
  // Not found → the Jira issue was created directly in Jira (not by Vocaply) → silent return.
  const actionItem = await actionItemsRepository.findByJiraIssueId(jiraIssueKey)

  if (!actionItem) {
    logger.info(
      { teamId, jiraIssueKey },
      'webhook.jira.action_item_not_found: no Vocaply action item linked to this Jira issue key — ignoring'
    )
    return
  }

  // ── STEP 3: Explicit Cross-Tenant Check (§9 Step 3, defense in depth) ─────
  // This check is structurally near-impossible to trigger (jira_issue_id is globally
  // unique across all action_items), but it is written EXPLICITLY because:
  //   a. Defense in depth applies even against "structurally near-impossible" scenarios
  //   b. The cost of writing it is trivial
  //   c. A real cross-tenant mutation would be a serious data-integrity incident
  if (actionItem.teamId !== teamId) {
    logger.warn(
      { teamId, actionItemTeamId: actionItem.teamId, jiraIssueKey, actionItemId: actionItem.id },
      'webhook.jira.cross_tenant_mismatch: action item teamId does not match webhook teamId — rejecting (defense in depth)'
    )
    return
  }

  // ── STEP 4: Status Name Mapping (§9 Step 4, §15) ──────────────────────────
  const isNowComplete = completedStatusNames.has(newStatusName)

  // ── STEP 5: No-Op Short-Circuit (§9 Step 5) ───────────────────────────────
  // Guards against two redundant-trigger scenarios:
  //   a. Jira redelivering an event that passed idempotency (unlikely but defensive)
  //   b. A genuinely new status change that maps to the same boolean (e.g. "In Review" → "In Progress")
  if (isNowComplete === actionItem.completed) {
    logger.info(
      { teamId, actionItemId: actionItem.id, jiraIssueKey, isNowComplete, alreadyCompleted: actionItem.completed },
      'webhook.jira.no_op: action item already in the target state — skipping write'
    )
    return
  }

  // ── STEP 6: Persist System-Attributed Update (§9 Step 6) ──────────────────
  // completedById: null is the deliberate signal: "Jira completed this, not a human."
  // The existing nullable column supports this with zero schema change.
  await actionItemsRepository.updateSystemAttributed(actionItem.id, {
    completed:     isNowComplete,
    completedAt:   isNowComplete ? new Date() : null,
    completedById: null,  // system-attributed — intentional null
  })

  logger.info(
    {
      teamId,
      actionItemId: actionItem.id,
      jiraIssueKey,
      completed:     isNowComplete,
      newStatusName,
    },
    'webhook.jira.status_updated'
  )

  // ── STEP 7: Real-Time Socket.io Emission (§9 Step 7) ──────────────────────
  // source: 'jira' lets the frontend distinguish this from a human in-app completion.
  // Wrapped in try/catch so a Socket.io/Redis-adapter failure NEVER prevents the
  // already-committed DB write from being considered successful.
  try {
    getIO().to(teamRoom(teamId)).emit(SERVER_EVENTS.ACTION_ITEM_COMPLETED, {
      actionItemId: actionItem.id,
      completed:    isNowComplete,
      source:       'jira',
    })
  } catch (err) {
    // Non-fatal: per platform-wide rule (Day 18 §10.4) — Socket.io failure must
    // never block or undo the underlying state update.
    logger.warn(
      { err, teamId, actionItemId: actionItem.id },
      'webhook.jira.socket_emit_failed: Socket.io emission failed (non-fatal, DB write already committed)'
    )
  }

  // ── STEP 8: Commitment Cascade (§9 Step 8, §14) ───────────────────────────
  // Only triggered when the action item just moved TO completed (not FROM completed).
  // Resolves the linkedCommitmentId from the action item record (Path B FK, §5).
  if (isNowComplete) {
    await triggerCommitmentCascade(teamId, actionItem)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// triggerCommitmentCascade — Day 59 §14
//
// Fulfils the commitment linked to this action item, IF one exists and IF
// the existing transition-validation logic permits it.
//
// This is a CONDITIONAL, BEST-EFFORT operation. Two explicit races are handled:
//   1. No linked commitment: silent return — not every action item has one.
//   2. Commitment already in terminal state (e.g. already FULFILLED via another
//      path): the updateCommitmentStatus call will throw INVALID_TRANSITION;
//      this is caught and logged at INFO (not ERROR), per §14's race design.
// ─────────────────────────────────────────────────────────────────────────────
async function triggerCommitmentCascade(
  teamId:     string,
  actionItem: { id: string; linkedCommitmentId?: string | null; teamId: string }
): Promise<void> {
  if (!actionItem.linkedCommitmentId) {
    // No linked commitment — not every action item is co-extracted with one.
    return
  }

  const linkedCommitmentId = actionItem.linkedCommitmentId

  logger.info(
    { teamId, actionItemId: actionItem.id, linkedCommitmentId },
    'webhook.jira.cascade_triggered: attempting to fulfil linked commitment'
  )

  try {
    // Load the commitment to verify it exists and is in a transition-eligible state.
    const commitment = await prisma.commitment.findFirst({
      where: { id: linkedCommitmentId, teamId },
    })

    if (!commitment) {
      logger.info(
        { teamId, linkedCommitmentId },
        'webhook.jira.cascade_skipped: linked commitment not found or belongs to a different team'
      )
      return
    }

    // Only PENDING and DEFERRED commitments can be FULFILLED (ALLOWED_TRANSITIONS from Day 19).
    const transitionableStatuses = new Set(['PENDING', 'DEFERRED'])
    if (!transitionableStatuses.has(commitment.status)) {
      logger.info(
        { teamId, linkedCommitmentId, currentStatus: commitment.status },
        'webhook.jira.cascade_rejected: commitment already in terminal state — benign race, not an error'
      )
      return
    }

    // Fulfil the commitment — system-attributed (manualStatusById remains unchanged,
    // preserving any existing value; we add resolvedAt + status in a single write).
    await prisma.commitment.update({
      where: { id: linkedCommitmentId },
      data: {
        status:     'FULFILLED',
        resolvedAt: new Date(),
        // Note: we do NOT set manualStatusById here — this was NOT a human action.
        // The existing column continues to reflect whoever last manually set status,
        // or null if it's never been manually changed. This preserves the audit trail.
      },
    })

    // Recalculate the commitment owner's score (same path as the human-initiated route).
    const newScore = await calculateCommitmentScore(commitment.ownerId, teamId)
    await prisma.user.update({
      where: { id: commitment.ownerId },
      data:  { commitmentScore: newScore.score },
    })

    // Emit the commitment fulfilled event (same event the human-initiated path emits).
    // source is NOT on this event's shape (Day 19 established COMMITMENT_FULFILLED
    // before Day 59's source-tagging concept) — adding source would be a breaking
    // change to the existing frontend contract. Frontend already handles this event.
    try {
      getIO().to(teamRoom(teamId)).emit(SERVER_EVENTS.COMMITMENT_FULFILLED, {
        commitmentId: linkedCommitmentId,
      })
    } catch (socketErr) {
      logger.warn(
        { socketErr, linkedCommitmentId },
        'webhook.jira.cascade: Socket.io commitment fulfilled emit failed (non-fatal)'
      )
    }

    logger.info(
      {
        teamId,
        actionItemId: actionItem.id,
        linkedCommitmentId,
        ownerId: commitment.ownerId,
        newScore: newScore.score,
      },
      'webhook.jira.cascade_fulfilled: commitment fulfiled via Jira reverse-sync'
    )
  } catch (err: any) {
    // The cascade failing must NEVER propagate to the webhook handler or cause
    // any error response. The action item update (Step 6) already succeeded —
    // a cascade failure is an internal concern only.
    logger.warn(
      { err: err.message, teamId, actionItemId: actionItem.id, linkedCommitmentId },
      'webhook.jira.cascade_error: commitment cascade failed (non-fatal, action item update was committed)'
    )
  }
}
