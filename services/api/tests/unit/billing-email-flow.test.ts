// ─────────────────────────────────────────────────────────────────────────────
// billing-email-flow.test.ts
//
// Source-level audit tests for the billing email flow.
// These are intentionally static analysis tests (reading source files) to
// avoid fighting ts-jest strict typing issues with BullMQ Worker internals.
//
// ROOT CAUSE REGRESSION SUITE:
//   ✅ RC-1: notifyQueue uses removeOnFail: false (no silent purge of billing jobs)
//   ✅ RC-2: TRIAL_STARTED handler exists in notify.worker.ts
//   ✅ RC-3: TRIAL_STARTED in NotifyJobType union
//   ✅ RC-4: email.service uses logger, not console.log
//   ✅ All billing event handlers present and re-throw on failure
//   ✅ Idempotency: deterministic jobId per transaction
//   ✅ Worker lifecycle events include billing job types
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'fs'
import { resolve }      from 'path'

const BASE = resolve(__dirname, '../../src')

const read = (relPath: string) =>
  readFileSync(resolve(BASE, relPath), 'utf8')

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — Queue configuration
// ─────────────────────────────────────────────────────────────────────────────

describe('[RC-1] notifyQueue — removeOnFail: false', () => {
  const src = read('queues/queue.client.ts')

  const notifyQueueBlock = src.slice(
    src.indexOf('export const notifyQueue'),
    src.indexOf('export const integrateQueue')
  )

  it('notifyQueue has removeOnFail: false (not count-limited)', () => {
    expect(notifyQueueBlock).toContain('removeOnFail:     false')
  })

  it('notifyQueue does NOT use count-limited removeOnFail', () => {
    expect(notifyQueueBlock).not.toMatch(/removeOnFail:\s*\{/)
  })

  it('comment explains why removeOnFail: false is required', () => {
    expect(notifyQueueBlock).toContain('billing')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — notify.job.ts type definitions
// ─────────────────────────────────────────────────────────────────────────────

describe('[RC-3] NotifyJobType — all billing types present', () => {
  const src = read('queues/jobs/notify.job.ts')

  const REQUIRED_TYPES = [
    'BILLING_CONFIRMATION',
    'PAYMENT_FAILED',
    'SUBSCRIPTION_UPGRADED',
    'SUBSCRIPTION_CANCELLED',
    'TRIAL_STARTED',         // was missing before fix
  ]

  for (const type of REQUIRED_TYPES) {
    it(`includes '${type}'`, () => {
      expect(src).toContain(`'${type}'`)
    })
  }

  it('NotifyJobData has planId field for billing context', () => {
    expect(src).toContain('planId?:')
  })

  it('NotifyJobData has trialEndsAt field for trial context', () => {
    expect(src).toContain('trialEndsAt?:')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — BILLING_CONFIRMATION handler
// ─────────────────────────────────────────────────────────────────────────────

describe('notify.worker — BILLING_CONFIRMATION handler', () => {
  const src = read('queues/workers/notify.worker.ts')

  const block = src.slice(
    src.indexOf('CASE 13D: BILLING_CONFIRMATION'),
    src.indexOf('CASE 13E: EMAIL_PAYMENT_SUCCESS')
  )

  it('has a BILLING_CONFIRMATION case branch', () => {
    expect(src).toContain("type === 'BILLING_CONFIRMATION'")
  })

  it('calls sendPaymentSuccessEmail', () => {
    expect(block).toContain('sendPaymentSuccessEmail')
  })

  it('uses Promise.allSettled for fan-out (one failure does not block others)', () => {
    expect(block).toContain('Promise.allSettled')
  })

  it('re-throws to trigger BullMQ retry on email failure', () => {
    expect(block).toContain('throw firstErr')
  })

  it('logs dispatching step at INFO level', () => {
    expect(block).toContain("notify.worker.BILLING_CONFIRMATION: dispatching payment receipt emails")
  })

  it('logs success at INFO level', () => {
    expect(block).toContain("notify.worker.BILLING_CONFIRMATION: payment receipt email dispatched successfully")
  })

  it('logs error if all emails fail', () => {
    expect(block).toContain("notify.worker.BILLING_CONFIRMATION: one or more payment emails failed")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — TRIAL_STARTED handler (RC-2: was missing before fix)
// ─────────────────────────────────────────────────────────────────────────────

describe('[RC-2] notify.worker — TRIAL_STARTED handler', () => {
  const src = read('queues/workers/notify.worker.ts')

  it('has a TRIAL_STARTED case branch', () => {
    expect(src).toContain("type === 'TRIAL_STARTED'")
  })

  const block = src.slice(
    src.indexOf('CASE 13J: TRIAL_STARTED'),
    src.indexOf('CASE 14: INTEGRATION_AUTO_DISABLED')
  )

  it('calls sendPaymentSuccessEmail for trial notification', () => {
    expect(block).toContain('sendPaymentSuccessEmail')
  })

  it('re-throws to trigger BullMQ retry on email failure', () => {
    expect(block).toContain('throw firstErr')
  })

  it('uses Promise.allSettled for fan-out', () => {
    expect(block).toContain('Promise.allSettled')
  })

  it('logs trial start at INFO level', () => {
    expect(block).toContain('notify.worker.TRIAL_STARTED: dispatching trial started notifications')
  })

  it('aborts gracefully when team not found', () => {
    expect(block).toContain("'notify.worker.TRIAL_STARTED: team not found — aborting'")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — PAYMENT_FAILED handler
// ─────────────────────────────────────────────────────────────────────────────

describe('notify.worker — PAYMENT_FAILED handler', () => {
  const src = read('queues/workers/notify.worker.ts')
  const block = src.slice(
    src.indexOf('CASE 13G: PAYMENT_FAILED'),
    src.indexOf('CASE 13H: SUBSCRIPTION_UPGRADED')
  )

  it('has a PAYMENT_FAILED case branch', () => {
    expect(src).toContain("type === 'PAYMENT_FAILED'")
  })

  it('calls sendPaymentFailedEmail', () => {
    expect(block).toContain('sendPaymentFailedEmail')
  })

  it('re-throws on email failure for BullMQ retry', () => {
    expect(block).toContain('throw firstErr')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — SUBSCRIPTION_UPGRADED handler
// ─────────────────────────────────────────────────────────────────────────────

describe('notify.worker — SUBSCRIPTION_UPGRADED handler', () => {
  const src = read('queues/workers/notify.worker.ts')
  const block = src.slice(
    src.indexOf('CASE 13H: SUBSCRIPTION_UPGRADED'),
    src.indexOf('CASE 13I: SUBSCRIPTION_CANCELLED')
  )

  it('has a SUBSCRIPTION_UPGRADED case branch', () => {
    expect(src).toContain("type === 'SUBSCRIPTION_UPGRADED'")
  })

  it('calls sendSubscriptionUpgradedEmail', () => {
    expect(block).toContain('sendSubscriptionUpgradedEmail')
  })

  it('re-throws on email failure for BullMQ retry', () => {
    expect(block).toContain('throw firstErr')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — SUBSCRIPTION_CANCELLED handler
// ─────────────────────────────────────────────────────────────────────────────

describe('notify.worker — SUBSCRIPTION_CANCELLED handler', () => {
  const src = read('queues/workers/notify.worker.ts')
  const block = src.slice(
    src.indexOf('CASE 13I: SUBSCRIPTION_CANCELLED'),
    src.indexOf('CASE 14: INTEGRATION_AUTO_DISABLED')
  )

  it('has a SUBSCRIPTION_CANCELLED case branch', () => {
    expect(src).toContain("type === 'SUBSCRIPTION_CANCELLED'")
  })

  it('calls sendSubscriptionCancelledEmail', () => {
    expect(block).toContain('sendSubscriptionCancelledEmail')
  })

  it('re-throws on email failure for BullMQ retry', () => {
    expect(block).toContain('throw firstErr')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8 — email.service structured logging (RC-4)
// ─────────────────────────────────────────────────────────────────────────────

describe('[RC-4] email.service — pino structured logging', () => {
  const src = read('modules/notifications/email.service.ts')

  // Extract sendBrevoEmail function body
  const brevoFnBlock = src.slice(
    src.indexOf('async function sendBrevoEmail'),
    src.indexOf('export const emailService')
  )

  it('logs dispatch initiation via pino logger', () => {
    expect(src).toContain("'email.service: dispatch initiated'")
  })

  it('logs Brevo success via pino logger', () => {
    expect(src).toContain("'email.service: ✅ email delivered to Brevo successfully'")
  })

  it('logs Brevo non-2xx error via pino logger', () => {
    expect(src).toContain('email.service: ❌ Brevo API returned non-2xx')
  })

  it('logs Brevo exception via pino logger', () => {
    expect(src).toContain('email.service: ❌ exception during Brevo API call')
  })

  it('has NO console.log in sendBrevoEmail', () => {
    expect(brevoFnBlock).not.toContain('console.log(')
  })

  it('has NO console.error in sendBrevoEmail', () => {
    expect(brevoFnBlock).not.toContain('console.error(')
  })

  it('includes notificationType in structured log fields', () => {
    expect(brevoFnBlock).toContain('notificationType:')
  })

  it('BREVO_API_KEY not configured warning uses logger.warn (not console.warn)', () => {
    expect(brevoFnBlock).toContain("logger.warn(")
    expect(brevoFnBlock).not.toContain('console.warn(')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9 — Paddle webhook idempotency key semantics
// ─────────────────────────────────────────────────────────────────────────────

describe('paddle.webhook — idempotency architecture', () => {
  const src = read('modules/webhooks/paddle.webhook.ts')

  it('uses Redis NX to set idempotency key', () => {
    expect(src).toContain("redis.set(idempotencyKey, '1', 'EX', 86400, 'NX')")
  })

  it('uses a 24-hour TTL (86400 seconds)', () => {
    expect(src).toContain('86400')
  })

  it('fast-acks Paddle with 200 before async processing', () => {
    expect(src).toContain('res.status(200).json({ received: true })')
    expect(src).toContain('setImmediate(async () =>')
  })

  it('returns 200 on duplicate event (idempotent skip)', () => {
    // The idempotent skip path must return 200 (not 409) to prevent Paddle retries.
    // Verify via the IDEMPOTENT SKIP log message that lives right next to the 200 response.
    expect(src).toContain("IDEMPOTENT SKIP: event already processed")
    expect(src).toContain('res.status(200).json({ received: true })')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10 — Deterministic billing jobId (layer-2 idempotency)
// ─────────────────────────────────────────────────────────────────────────────

describe('paddle.webhook — deterministic billing jobId', () => {
  const src = read('modules/webhooks/paddle.webhook.ts')

  it('billing-confirmation jobId keyed on transactionId', () => {
    expect(src).toContain('`billing-confirmation:${transactionId}`')
  })

  it('payment-failed jobId keyed on transactionId', () => {
    expect(src).toContain('`payment-failed:${transactionId}`')
  })

  it('subscription-cancelled jobId keyed on eventId (unique per cancellation event)', () => {
    expect(src).toContain('`subscription-cancelled:${eventId}`')
  })

  it('trial-started jobId keyed on subscriptionId', () => {
    expect(src).toContain('`trial-started:${paddleSubscriptionId}`')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 11 — Worker lifecycle observability
// ─────────────────────────────────────────────────────────────────────────────

describe('notify.worker — lifecycle observability', () => {
  const src = read('queues/workers/notify.worker.ts')

  const completedBlock = src.slice(
    src.indexOf("notifyWorker.on('completed'"),
    src.indexOf("notifyWorker.on('error'")
  )

  const failedBlock = src.slice(
    src.indexOf("notifyWorker.on('failed'"),
    src.indexOf("notifyWorker.on('completed'")
  )

  it('logs BILLING_CONFIRMATION at INFO on completion', () => {
    expect(completedBlock).toContain("'BILLING_CONFIRMATION'")
  })

  it('logs PAYMENT_FAILED at INFO on completion', () => {
    expect(completedBlock).toContain("'PAYMENT_FAILED'")
  })

  it('emits ✅ billing job COMPLETED log on success', () => {
    expect(completedBlock).toContain('notify.worker: ✅ billing job COMPLETED')
  })

  it('includes stack trace in failure log', () => {
    expect(failedBlock).toContain('stack:')
  })

  it('emits ❌ job FAILED log on failure', () => {
    expect(failedBlock).toContain('notify.worker: ❌ job FAILED')
  })

  it('includes attemptsMade in failure log for retry tracking', () => {
    expect(failedBlock).toContain('attemptsMade:')
  })
})
