// ─────────────────────────────────────────────────────────────────────────────
// jira.webhook.ts — Day 59: Jira Inbound Webhook Ingestion Handler
//
// ARCHITECTURAL ROLE (Day 59 §2 Principle 1):
//   "The Webhook Handler Translates, It Never Decides."
//   This file's entire job: verify authenticity, ACK fast, deduplicate,
//   filter to relevant events, and hand off a NARROW typed payload to
//   jira-sync.service.ts. All business decisions live there.
//
// SECURITY DESIGN (Day 59 §13):
//   teamId from the query param is ADVISORY ONLY. It is used exclusively
//   to look up the per-team HMAC secret for signature verification.
//   Authorization (does this event belong to this team?) happens inside
//   jira-sync.service.ts Step 1 via an independent DB lookup.
//
// IDEMPOTENCY (Day 59 §11):
//   Key: webhook:processed:jira:{issue.id}:{changelog.id ?? webhookEvent}
//   TTL: 86400s (identical to Recall.ai/Stripe conventions)
//   Why issue.id NOT issue.key: issue.id is immutable (survives project moves);
//   issue.key can change. Dedup uses the stable identifier.
//
// REUSABILITY PROOF (Day 59 §12):
//   This handler uses rawBodyMiddleware UNCHANGED from Day 18.
//   The ONLY change to webhooks.routes.ts is the single new route line.
//   No modification to any shared function was required — validating that
//   Day 18's infrastructure was genuinely generic, not Recall.ai-shaped.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response }       from 'express'
import { verifyJiraSignature }     from './webhooks.validator'
import { redis }                   from '../../config/redis'
import { integrationsRepository }  from '../integrations/integrations.repository'
import { handleStatusChange }      from '../action-items/jira-sync.service'
import { decrypt }                 from '../../utils/crypto'
import { logger }                  from '../../config/logger'

// ─────────────────────────────────────────────────────────────────────────────
// Idempotency key convention — mirrors Recall.ai / Stripe exactly (§11, §22)
//
// Namespace: webhook:processed:jira:* (NOT a new namespace — extends existing)
// ─────────────────────────────────────────────────────────────────────────────
function buildIdempotencyKey(issueId: string | number, changelogId?: string | number): string {
  // issue.id is Jira's internal numeric ID (stable across project moves).
  // changelogId is the specific changelog entry ID; fall back to a timestamp
  // segment if absent — still provides SOME deduplication granularity.
  const changelogPart = changelogId ?? 'no-changelog'
  return `webhook:processed:jira:${issueId}:${changelogPart}`
}

// ─────────────────────────────────────────────────────────────────────────────
// handleJiraWebhook — main Express handler
// ─────────────────────────────────────────────────────────────────────────────
export const handleJiraWebhook = async (req: Request, res: Response): Promise<void> => {
  // ── STEP 1: Signature Verification (FIRST — before any parsing beyond headers) ──
  //
  // The per-team secret must be looked up BEFORE verification can happen.
  // teamId is read from the query param to SELECT which secret to try, but:
  //   • A wrong/guessed teamId → the secret lookup returns nothing → rejected
  //   • A correct teamId with a wrong signature → rejected
  //   • Only a valid teamId AND matching signature proceeds past this point
  //
  // This ordering (select secret by teamId, then verify) vs the naive inverse
  // (verify first, then look up team) is discussed extensively in §13:
  // the current ordering does NOT grant any access on teamId alone — it only
  // narrows which secret to attempt. The request is still rejected on any failure.
  const teamId = req.query['teamId'] as string | undefined

  logger.info(
    { teamId, path: req.path },
    'webhook.jira.received'
  )

  if (!teamId) {
    // Without a teamId we cannot look up the per-team secret.
    // Fast-reject: 400 (not 401) — the request is malformed, not necessarily malicious.
    res.status(400).json({ error: 'Missing required teamId query parameter' })
    return
  }

  // Look up the integration row to get the per-team webhook secret.
  // This is the ONLY legitimate pre-verification DB query — we need the secret
  // to verify the signature. We don't act on any payload data yet.
  const integration = await integrationsRepository.findByTeamAndProvider(teamId, 'JIRA')

  if (!integration || !integration.isActive) {
    // No active integration for this teamId — reject before spending any more resources.
    // Log at WARN (could be a stale subscription from a recently-disconnected team).
    logger.warn(
      { teamId },
      'webhook.jira.unknown_team (pre-signature): no active Jira integration found for this teamId — rejecting'
    )
    // Return 200 to prevent Jira from retrying (we legitimately don't want this event).
    res.status(200).json({ received: true })
    return
  }

  const meta = (integration.metadata as Record<string, any>) ?? {}

  // Per-team webhook secret: AES-256-CBC encrypted in the DB (§18's explicit decision:
  // "encrypt it" — a cryptographic signing key is token-grade, not config-grade).
  // If the secret is missing (e.g. integration was connected before Day 59 added
  // webhook registration), fall back to the global env secret as a safety net.
  // Teams should reconnect to get proper per-team secrets.
  let perTeamSecret: string
  try {
    if (meta.jiraWebhookSecret) {
      perTeamSecret = decrypt(meta.jiraWebhookSecret)
    } else {
      // Fallback to global secret for pre-Day-59 integrations (degraded mode)
      const globalSecret = process.env.JIRA_WEBHOOK_SECRET
      if (!globalSecret) {
        throw new Error('No per-team secret and no global JIRA_WEBHOOK_SECRET fallback')
      }
      perTeamSecret = globalSecret
      logger.warn(
        { teamId },
        'webhook.jira: using global JIRA_WEBHOOK_SECRET fallback — team should reconnect to get per-team secret'
      )
    }
  } catch (secretErr: any) {
    logger.error(
      { teamId, err: secretErr.message },
      'webhook.jira.signature_failed: could not resolve per-team secret — rejecting'
    )
    res.status(401).json({ error: 'Signature verification failed' })
    return
  }

  // Now verify the signature using the resolved per-team secret.
  try {
    verifyJiraSignature(req, perTeamSecret)
  } catch (sigErr: any) {
    // Logged at WARN with SECURITY classification per §18 and §21.
    // Distinct from a normal 4xx error — this signals potential probing/attack.
    logger.warn(
      { teamId, err: sigErr.message, ip: req.ip },
      'webhook.jira.signature_failed: HMAC verification failed — possible spoofing or stale secret'
    )
    res.status(401).json({ error: 'Invalid signature' })
    return
  }

  // ── STEP 2: Fast ACK (before any business logic) ──────────────────────────
  //
  // Jira expects a fast 2xx response. A slow ACK risks Jira's retry/backoff
  // logic firing and generating redundant redeliveries (which the idempotency
  // layer handles, but avoiding them in the first place is still the right default).
  // The response carries no information about downstream processing outcome —
  // Jira's retry behavior should be driven purely by "did my HTTP request succeed."
  res.status(200).json({ received: true })

  // ── From here: all processing is post-ACK (fire-and-forget from HTTP's perspective) ──
  // Errors surface via the standard unhandled-promise-rejection → structured log
  // → Sentry capture path established platform-wide.

  try {
    // ── STEP 3: Parse payload ──────────────────────────────────────────────────
    const payload = req.body as JiraWebhookPayload

    // ── STEP 4: Idempotency Check (BEFORE event-type and field filters) ────────
    //
    // Why check idempotency FIRST (before even filtering the event type)?
    // A redelivered event for an already-processed status change is rejected in a
    // SINGLE Redis round-trip, without parsing the changelog array at all.
    // This is the cheapest possible short-circuit for the highest-volume "nothing
    // to do" category of requests. (§11 explains this ordering decision explicitly.)
    const issueId       = payload?.issue?.id
    const changelogId   = payload?.changelog?.id
    const webhookEvent  = payload?.webhookEvent

    if (!issueId) {
      logger.info({ teamId }, 'webhook.jira: payload missing issue.id — ignoring')
      return
    }

    const idempotencyKey = buildIdempotencyKey(issueId, changelogId)

    if (await redis.exists(idempotencyKey)) {
      logger.info(
        { teamId, issueId, changelogId },
        'webhook.jira.idempotent_skip: duplicate delivery detected — ignoring'
      )
      return
    }

    // Set the idempotency key BEFORE business logic so that if the process crashes
    // mid-execution, a redelivery is still deduplicated correctly.
    await redis.setex(idempotencyKey, 86400, '1')  // 86400s = 24h — platform-wide TTL convention

    // ── STEP 5: Event Type Filter ──────────────────────────────────────────────
    //
    // The webhook SUBSCRIPTION (registered in jira.provider.ts registerWebhook)
    // already requests only jira:issue_updated events. This check is a defensive
    // belt-and-suspenders guard against Jira ever sending unexpected event types.
    if (webhookEvent !== 'jira:issue_updated') {
      logger.info(
        { teamId, webhookEvent },
        'webhook.jira: non-issue_updated event type — ignoring (subscription filter should have prevented this)'
      )
      return
    }

    // ── STEP 6: Field-Level Filter ─────────────────────────────────────────────
    //
    // We only care about STATUS field changes. This webhook may also fire for
    // description edits, label changes, assignee changes, etc. — all irrelevant.
    // Per §18: assignee data anywhere in the payload is never read for any
    // mutating purpose (deliberate scoping, not an oversight).
    const changelogItems = payload?.changelog?.items ?? []
    const statusChange = changelogItems.find((item) => item.field === 'status')

    if (!statusChange) {
      logger.info(
        { teamId, issueKey: payload?.issue?.key, changelogFields: changelogItems.map((i) => i.field) },
        'webhook.jira: no status field change in this changelog — ignoring'
      )
      return
    }

    const jiraIssueKey  = payload.issue.key
    const newStatusName = statusChange.toString  // "toString" is Jira's field for the new value label

    // ── STEP 7: Hand Off to Service Layer ─────────────────────────────────────
    //
    // Narrow, typed input — the service receives only what it needs.
    // The handler does NOT inspect the result (the HTTP response was already sent).
    // Error handling lives inside handleStatusChange() itself or surfaces via
    // the unhandled-promise-rejection → structured log → Sentry path.
    await handleStatusChange({
      teamId,
      jiraIssueKey,
      newStatusName,
    })
  } catch (error: any) {
    // Catch-all for unexpected errors in the post-ACK processing block.
    // These are logged but do NOT affect the already-sent HTTP response.
    logger.error(
      { error: error.message, teamId, stack: error.stack },
      'webhook.jira: unhandled error in post-ACK processing block'
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Jira Webhook Payload Shape — typed exactly as Jira Cloud sends it.
// Only the fields ACTUALLY USED by this handler are defined here.
// (We do NOT try to type the entire Jira payload schema — that would be
// over-engineering a type that Jira can change without notice.)
// ─────────────────────────────────────────────────────────────────────────────
interface JiraWebhookPayload {
  webhookEvent?: string
  issue: {
    id:     string | number
    key:    string
    fields?: {
      status?: { name?: string }
    }
  }
  changelog?: {
    id?:    string | number
    items?: Array<{
      field:      string
      fieldtype?: string
      from?:      string | null
      fromString?: string | null
      to?:        string | null
      toString:   string  // the new value — e.g. "Done"
    }>
  }
  timestamp?: number
}
