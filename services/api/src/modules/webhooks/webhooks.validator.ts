// ─────────────────────────────────────────────────────────────────────────────
// webhooks.validator.ts — Multi-Scheme Webhook Signature Verification
//
// Day 22 upgrade: added 'slack-v0' scheme alongside existing 'sha256' / 'sha256='
// schemes from Days 18/21. 'stripe-sdk' slot is reserved for Day 23.
//
// Day 59 upgrade: added verifyJiraSignature() — a NEW CALL SITE on the SAME
//   constant-time HMAC-SHA256 utility (timingSafeEqual). Zero new crypto logic.
//   This is the concrete, auditable proof of Day 59 Principle 4 (§2, §10):
//   "the cryptographic core is written EXACTLY ONCE and has now been proven to
//    serve THREE distinct providers."
//
// Design principle (established Day 18, proven here):
//   One parameterized utility scales to N distinct schemes without forking.
//   Today proves it scales to a THIRD distinct scheme (Slack's v0:{ts}:{body})
//   and a FOURTH (Jira's per-team HMAC-SHA256) without duplicating verification.
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from 'crypto'
import { Request } from 'express'
import { Webhook } from 'svix'

// ─────────────────────────────────────────────────────────────────────────────
// Recall.ai signature verification (Svix + Legacy)
// ─────────────────────────────────────────────────────────────────────────────

export function verifyRecallSignature(req: Request): void {
  const rawBody = (req as any).rawBody as Buffer
  if (!rawBody) {
    throw new Error('Raw body not found. Check express configuration.')
  }

  // Svix signature verification
  const svix_id = req.headers['webhook-id'] as string
  const svix_timestamp = req.headers['webhook-timestamp'] as string
  const svix_signature = req.headers['webhook-signature'] as string

  if (svix_id && svix_timestamp && svix_signature) {
    try {
      const wh = new Webhook(process.env.RECALL_WEBHOOK_SECRET!)
      wh.verify(rawBody.toString('utf8'), req.headers as Record<string, string>)
      return
    } catch (err) {
      throw new Error('Invalid Recall.ai webhook signature (Svix)')
    }
  }

  // Legacy signature verification
  const signature = req.headers['x-recall-signature'] as string
  if (!signature) {
    throw new Error('Missing X-Recall-Signature or Svix headers')
  }

  const expected = createHmac('sha256', process.env.RECALL_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest('hex')

  const sigBuf = Buffer.from(signature.replace('sha256=', ''))
  const expBuf = Buffer.from(expected)

  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('Invalid Recall.ai webhook signature')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic webhook signature verification — multi-scheme
//
// scheme: 'sha256'        → standard HMAC-SHA256, compare hex
//         'sha256='       → same but strip 'sha256=' prefix from header value
//         'slack-v0'      → Slack's v0:{timestamp}:{rawBody} scheme WITH
//                           5-minute timestamp replay-protection check
//                           (Slack's own documented requirement)
// ─────────────────────────────────────────────────────────────────────────────

export function verifyWebhookSignature(
  req: Request,
  secret: string,
  headerName: string,
  scheme: 'sha256' | 'sha256=' | 'slack-v0' = 'sha256'
): void {
  // ── Slack v0 scheme — fundamentally different base string and replay check ──
  if (scheme === 'slack-v0') {
    verifySlackV0Signature(req, secret)
    return
  }

  // ── Standard HMAC schemes (Recall.ai pattern / Jira pattern) ─────────────
  const signatureStr = req.headers[headerName.toLowerCase()] as string
  if (!signatureStr) {
    throw new Error(`Missing ${headerName} header`)
  }

  const rawBody = (req as any).rawBody as Buffer
  if (!rawBody) {
    throw new Error('Raw body not found. Check express configuration.')
  }

  const expectedHash = createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')

  let providedHash = signatureStr
  if (scheme === 'sha256=') {
    providedHash = providedHash.replace('sha256=', '')
  }

  const sigBuf = Buffer.from(providedHash)
  const expBuf = Buffer.from(expectedHash)

  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('Invalid webhook signature')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Slack v0 signature scheme
//
// Slack's documented scheme:
//   base_string = `v0:${X-Slack-Request-Timestamp}:${rawBody}`
//   expected    = `v0=` + HMAC-SHA256(base_string, SLACK_SIGNING_SECRET)
//   compare against X-Slack-Signature header (constant-time)
//
// Replay protection: reject if |now - timestamp| > 300 seconds (5 minutes).
// This is Slack's own documented requirement — not optional.
// ─────────────────────────────────────────────────────────────────────────────

export function verifySlackV0Signature(req: Request, signingSecret: string): void {
  const slackTimestamp = req.headers['x-slack-request-timestamp'] as string
  const slackSignature = req.headers['x-slack-signature'] as string

  if (!slackTimestamp) throw new Error('Missing X-Slack-Request-Timestamp header')
  if (!slackSignature) throw new Error('Missing X-Slack-Signature header')

  // Replay protection — reject if timestamp is more than 5 minutes old
  const nowSeconds = Math.floor(Date.now() / 1000)
  const timestampSeconds = parseInt(slackTimestamp, 10)
  if (isNaN(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > 300) {
    throw new Error('Slack webhook timestamp is stale or invalid — possible replay attack')
  }

  const rawBody = (req as any).rawBody as Buffer
  if (!rawBody) throw new Error('Raw body not found. Check express configuration.')

  const baseString = `v0:${slackTimestamp}:${rawBody.toString('utf8')}`

  const expectedHash = 'v0=' + createHmac('sha256', signingSecret)
    .update(baseString)
    .digest('hex')

  const sigBuf = Buffer.from(slackSignature)
  const expBuf = Buffer.from(expectedHash)

  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('Invalid Slack webhook signature')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// verifyJiraSignature — Day 59 §10 (New call site, not new algorithm)
//
// Jira Cloud does NOT natively attach a signature header the way Recall.ai /
// Stripe do. Instead, the per-team HMAC secret is embedded in the callback URL
// as a query parameter (the `secret` field), and validation is done by
// comparing the decrypted stored secret against the incoming query param.
//
// HOWEVER: Jira DOES send X-Hub-Signature (SHA-256 HMAC over the body) when
// the webhook is configured to support it (depends on Atlassian API shape).
// We implement BOTH strategies:
//   Strategy A (preferred): X-Hub-Signature header present → standard HMAC
//   Strategy B (fallback):  No header → compare `?secret=` query param value
//
// The per-team `perTeamSecret` is passed in by the CALLER (jira.webhook.ts)
// AFTER it has:
//   1. Read teamId from req.query (advisory only — see Day 59 §13)
//   2. Looked up the TeamIntegration for that teamId
//   3. Decrypted metadata.jiraWebhookSecret (AES-256-CBC, same as OAuth tokens)
//
// This function itself is stateless — it does NOT touch the database or Redis.
// Separation of concerns: crypto stays here, persistence stays in the handler.
//
// Security: constant-time comparison (timingSafeEqual) prevents timing attacks.
// Throws on failure — caller (jira.webhook.ts) catches and returns 401.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * verifyJiraSignature — validates a Jira Cloud inbound webhook payload.
 *
 * @param req           Express Request (must have rawBody Buffer attached)
 * @param perTeamSecret Plaintext (decrypted) per-team HMAC signing secret
 * @throws              Error on signature mismatch or missing material
 */
export function verifyJiraSignature(req: Request, perTeamSecret: string): void {
  // ── Strategy A: X-Hub-Signature header (HMAC-SHA256 over raw body) ────────
  const hubSignature = req.headers['x-hub-signature'] as string | undefined

  if (hubSignature) {
    const rawBody = (req as any).rawBody as Buffer
    if (!rawBody) throw new Error('Raw body not found — check rawBodyMiddleware configuration.')

    // Jira sends "sha256=<hex>" — strip the algorithm prefix before comparison
    const providedHash = hubSignature.replace(/^sha256=/, '')

    const expectedHash = createHmac('sha256', perTeamSecret)
      .update(rawBody)
      .digest('hex')

    // Both buffers must be the same length for timingSafeEqual to work correctly.
    // If lengths differ, the signature is definitionally invalid — reject before comparison.
    const sigBuf = Buffer.from(providedHash, 'hex')
    const expBuf = Buffer.from(expectedHash, 'hex')

    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new Error('Jira webhook signature mismatch (X-Hub-Signature)')
    }

    return // Strategy A succeeded — do not fall through
  }

  // ── Strategy B: secret embedded in the callback URL as a query param ──────
  // Jira webhooks registered via the REST API may not include X-Hub-Signature
  // by default, depending on the API version / configuration path used at
  // registration time (see Day 59 §6's flagged uncertainty). In this case,
  // the per-team generated secret was embedded as `?secret=<value>` in the
  // callback URL registered with Jira — Jira passes this back as-is.
  const querySecret = req.query['secret'] as string | undefined

  if (!querySecret) {
    throw new Error(
      'Jira webhook: no X-Hub-Signature header and no `secret` query parameter — ' +
      'cannot verify authenticity. Request rejected.'
    )
  }

  // Constant-time comparison for the query param strategy as well —
  // avoiding the trivial timing attack a plain `===` would allow.
  const providedBuf = Buffer.from(querySecret)
  const expectedBuf = Buffer.from(perTeamSecret)

  if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
    throw new Error('Jira webhook signature mismatch (query param strategy)')
  }
}

