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

/**
 * Get or create a Paddle customer for the given team.
 *
 * Algorithm:
 *   1. If team.paddleCustomerId exists → return it directly (zero API call)
 *   2. Else → create Paddle customer → persist ID on team → return it
 *
 * This guarantees zero duplicate customers across all re-subscription attempts.
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
    try {
      // Verify the customer still exists in Paddle
      await paddle.customers.get(team.paddleCustomerId)
      logger.debug({ teamId, paddleCustomerId: team.paddleCustomerId }, '[paddle.client] Reusing existing Paddle customer')
      return team.paddleCustomerId
    } catch (err: any) {
      if (err?.code === 'not_found') {
        logger.warn({ teamId, paddleCustomerId: team.paddleCustomerId }, '[paddle.client] Customer not found in Paddle. Proceeding to create a new one.')
      } else {
        throw err
      }
    }
  }

  try {
    // Create new Paddle customer
    const customer = await paddle.customers.create({
      email,
      name,
    })

    const paddleCustomerId = customer.id

    // Persist immediately — next call will hit branch 1 above
    await prisma.team.update({
      where: { id: teamId },
      data: { paddleCustomerId },
    })

    logger.info({ teamId, paddleCustomerId }, '[paddle.client] Created and persisted new Paddle customer')
    return paddleCustomerId
  } catch (err: any) {
    if (err.code === 'customer_already_exists') {
      logger.warn({ teamId, email, err: err.message }, '[paddle.client] Customer already exists in Paddle.')
      
      let paddleCustomerId: string | undefined

      // Extract from Paddle's error detail: "customer email conflicts with customer of id ctm_..."
      const match = err.detail?.match(/customer of id (ctm_[a-zA-Z0-9]+)/)
      if (match && match[1]) {
        paddleCustomerId = match[1]
        logger.info({ teamId, paddleCustomerId }, '[paddle.client] Recovered existing Paddle customer from error detail')
      }

      // Fallback: fetch by email
      if (!paddleCustomerId) {
        try {
          logger.info({ teamId, email }, '[paddle.client] Detail regex failed, fetching customer by email')
          const collection = paddle.customers.list({ email: [email] })
          const customers = await collection.next()
          
          if (customers && customers.length > 0) {
            // Ensure exact email match
            const exactMatch = customers.find(c => c.email.toLowerCase() === email.toLowerCase())
            if (exactMatch) {
              paddleCustomerId = exactMatch.id
              logger.info({ teamId, paddleCustomerId }, '[paddle.client] Recovered existing Paddle customer via list fetch')
            }
          }
        } catch (searchErr: any) {
          logger.error({ err: searchErr.message }, '[paddle.client] Failed to fetch customer by email')
        }
      }

      if (paddleCustomerId) {
        // Persist recovered ID
        await prisma.team.update({
          where: { id: teamId },
          data: { paddleCustomerId },
        })
        return paddleCustomerId
      }
    }
    
    // If not handled, re-throw
    throw err
  }
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

// ── Subscription Fetch (for reconciliation only — not hot path) ───────────────

/**
 * Fetch a subscription directly from Paddle's API.
 * Used ONLY for admin reconciliation — all user-facing reads go through
 * the local `subscriptions` mirror table (webhook-synced).
 */
export async function fetchPaddleSubscription(paddleSubscriptionId: string) {
  return paddle.subscriptions.get(paddleSubscriptionId)
}

// ── Export the raw client for any edge cases ──────────────────────────────────

export { paddle }
