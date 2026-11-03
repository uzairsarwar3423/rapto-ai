// ─────────────────────────────────────────────────────────────────────────────
// paddle.client.ts — Paddle Server SDK Singleton
//
// RULES:
//   ✅ The ONLY file in the entire codebase that imports the Paddle SDK.
//   ✅ Three distinct credentials — never mix them up:
//       PADDLE_API_KEY          → server-side only, never logged, never in bundles
//       PADDLE_CLIENT_TOKEN     → intentionally public, used by Paddle.js in browser
//       PADDLE_WEBHOOK_SECRET   → used ONLY for HMAC webhook verification
//   ✅ Sandbox vs. production switched via PADDLE_ENVIRONMENT — never coupled to NODE_ENV
//   ✅ getOrCreatePaddleCustomer always checks DB first — zero duplicate customers
// ─────────────────────────────────────────────────────────────────────────────

import { Paddle, Environment, type Customer } from '@paddle/paddle-node-sdk'
import { prisma } from '../db/client'
import { logger } from '../config/logger'

// ── Env Validation (fail-fast at startup) ─────────────────────────────────────

function getRequiredEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`[paddle.client] Missing required env var: ${key}`)
  return val
}

const PADDLE_API_KEY        = getRequiredEnv('PADDLE_API_KEY')
const PADDLE_ENVIRONMENT    = (process.env.PADDLE_ENVIRONMENT ?? 'sandbox') as 'sandbox' | 'production'

// ── SDK Singleton ─────────────────────────────────────────────────────────────

const paddle = new Paddle(PADDLE_API_KEY, {
  environment: PADDLE_ENVIRONMENT === 'production' ? Environment.production : Environment.sandbox,
})

logger.info({ environment: PADDLE_ENVIRONMENT }, '[paddle.client] SDK initialized')

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CreateTransactionParams {
  priceId: string
  customerId: string
  teamId: string
  planId: string
  interval: 'month' | 'year'
}

export interface PaddleTransactionResult {
  /** Paddle transaction ID — returned to frontend for Paddle.js overlay checkout */
  transactionId: string
  /** Hosted checkout URL — alternative to overlay, redirect-based */
  checkoutUrl: string | null
}

// ── Customer Management ────────────────────────────────────────────────────────

async function persistCustomerIdIfUnset(teamId: string, paddleCustomerId: string): Promise<string> {
  // Compare-and-set: never overwrite a customer id a concurrent request already stored for this team.
  const res = await prisma.team.updateMany({ where: { id: teamId, paddleCustomerId: null }, data: { paddleCustomerId } })
  if (res.count === 1) return paddleCustomerId
  const current = await prisma.team.findUnique({ where: { id: teamId }, select: { paddleCustomerId: true } })
  return current?.paddleCustomerId ?? paddleCustomerId
}

/**
 * Get or create a Paddle customer for the given team.
 *
 *   1. team.paddleCustomerId exists → return it. NO verification call: `customers.get` needs the `customer.read`
 *      API-key permission, adds a round trip to every checkout, and a missing permission surfaced as a failed
 *      checkout. If the stored id is stale (deleted, or from another Paddle environment) the transaction create
 *      reports `not_found` for that id and the caller recovers via replaceStaleCustomer().
 *   2. otherwise create the customer (needs `customer.write`) and persist the id with a compare-and-set.
 *
 * Permanent errors (permission, validation) are rethrown untouched — they are never retried or masked.
 */
export async function getOrCreatePaddleCustomer(
  teamId: string,
  email: string,
  name: string
): Promise<string> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { paddleCustomerId: true },
  })

  if (team?.paddleCustomerId) {
    logger.debug({ teamId, paddleCustomerId: team.paddleCustomerId }, '[paddle.client] Reusing stored Paddle customer')
    return team.paddleCustomerId
  }

  return createCustomerForTeam(teamId, email, name)
}

async function createCustomerForTeam(teamId: string, email: string, name: string): Promise<string> {
  try {
    const customer = await paddle.customers.create({ email, name })
    const stored = await persistCustomerIdIfUnset(teamId, customer.id)
    logger.info({ teamId, paddleCustomerId: stored }, '[paddle.client] Created Paddle customer')
    return stored
  } catch (err: any) {
    if (err?.code !== 'customer_already_exists') throw err

    // Email is unique in Paddle (case-insensitive) and archived customers still count: reuse the existing one.
    let existingId: string | undefined = err.detail?.match(/(ctm_[a-zA-Z0-9]+)/)?.[1]
    let existingStatus: string | undefined
    if (!existingId) {
      const page = await paddle.customers.list({ email: [email], status: ['active', 'archived'] as any }).next()
      const exact = (page ?? []).find((c) => c.email.toLowerCase() === email.toLowerCase())
      existingId = exact?.id
      existingStatus = exact?.status
    }
    if (!existingId) throw err

    if (existingStatus === 'archived') {
      await paddle.customers.update(existingId, { status: 'active' })
    }
    const stored = await persistCustomerIdIfUnset(teamId, existingId)
    logger.info({ teamId, paddleCustomerId: stored }, '[paddle.client] Reused existing Paddle customer found by email')
    return stored
  }
}

/**
 * The stored customer id is unusable (Paddle says it does not exist — typically an id from the other Paddle
 * environment or a deleted customer). Detach it from the team (only if it is still the stale value) and create
 * a fresh customer. Billing history for the old id stays in our Invoice/Subscription tables untouched.
 */
export async function replaceStaleCustomer(
  teamId: string,
  staleCustomerId: string,
  email: string,
  name: string
): Promise<string> {
  await prisma.team.updateMany({ where: { id: teamId, paddleCustomerId: staleCustomerId }, data: { paddleCustomerId: null } })
  logger.warn(
    { teamId, staleCustomerId, alert: 'billing.stale_paddle_customer' },
    '[paddle.client] Stored Paddle customer id is unknown to Paddle — creating a replacement'
  )
  return getOrCreatePaddleCustomer(teamId, email, name)
}

// ── Transaction (Checkout) ─────────────────────────────────────────────────────

/**
 * Create a Paddle transaction for checkout.
 *
 * customData carries teamId/planId — these are the TRUST ANCHOR in all webhook handlers.
 * They are SET HERE and READ from Paddle's webhook payload — never from client input.
 */
export async function createTransaction(params: CreateTransactionParams): Promise<PaddleTransactionResult> {
  const { priceId, customerId, teamId, planId, interval } = params

  const transaction = await paddle.transactions.create({
    customerId,
    items: [{ priceId, quantity: 1 }],
    customData: {
      teamId,   // The trust anchor — resolves team in every webhook handler
      planId,   // Used for immediate optimistic plan display before webhook fires
      interval,
    },
  })

  return {
    transactionId: transaction.id,
    checkoutUrl: transaction.checkout?.url ?? null,
  }
}

// ── Customer Portal Session ────────────────────────────────────────────────────

/**
 * Create a Paddle Customer Portal session for self-serve billing management.
 * Returns a URL the ADMIN is redirected to — Paddle hosts the portal entirely.
 */
export async function createCustomerPortalSession(
  paddleCustomerId: string
): Promise<string> {
  const session = await paddle.customerPortalSessions.create(paddleCustomerId, [])

  if (!session.urls?.general?.overview) {
    throw new Error('[paddle.client] Paddle returned no portal URL')
  }

  return session.urls.general.overview
}

// ── Subscription Update (Plan Upgrade / Downgrade) ───────────────────────────

export interface UpdateSubscriptionPlanParams {
  paddleSubscriptionId: string
  priceId: string
  planId: string
  interval: 'month' | 'year'
  teamId: string
}

/**
 * Update an existing Paddle subscription plan (e.g. STARTER → GROWTH).
 * Prorates charges immediately and updates customData for webhook anchoring.
 */
export async function updateSubscriptionPlan(
  params: UpdateSubscriptionPlanParams
) {
  const { paddleSubscriptionId, priceId, planId, interval, teamId } = params

  const updatedSubscription = await paddle.subscriptions.update(paddleSubscriptionId, {
    items: [
      {
        priceId,
        quantity: 1,
      },
    ],
    prorationBillingMode: 'prorated_immediately',
    // custom_data is sent in full on every update: teamId is the webhook trust anchor and must never be dropped.
    customData: {
      teamId,
      planId,
      interval,
    },
  })

  logger.info(
    { paddleSubscriptionId, planId, priceId, interval },
    '[paddle.client] Updated Paddle subscription plan'
  )

  return updatedSubscription
}

// ── Export the raw client for any edge cases ──────────────────────────────────

export { paddle }

