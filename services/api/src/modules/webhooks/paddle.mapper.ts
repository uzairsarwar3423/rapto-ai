// ─────────────────────────────────────────────────────────────────────────────
// paddle.mapper.ts — pure translation of Paddle payloads into our subscription snapshot.
//
// Shared by webhook handlers, /billing/sync and the reconciliation job so all three interpret Paddle
// identically. No I/O. Paddle webhook bodies are snake_case; SDK entities (paddle.subscriptions.get) are
// camelCase — toSnake() normalizes both so mapping code reads ONE shape.
// ─────────────────────────────────────────────────────────────────────────────

import { PlanType, SubscriptionStatus } from '@prisma/client'
import { getPlanFromPriceId } from '../../config/plans.config'
import type { UpsertSubscriptionData } from '../billing/billing.types'

/** Thrown when an event can never be processed correctly by retrying (needs a human). */
export class UnresolvableEventError extends Error {
  constructor(message: string, public readonly teamId: string | null = null) {
    super(message)
    this.name = 'UnresolvableEventError'
  }
}

// ── key normalization ─────────────────────────────────────────────────────────

const CUSTOM_DATA_KEYS = new Set(['custom_data', 'customData'])

function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}

/** Deep camelCase → snake_case. Merchant-defined `custom_data` payloads are left untouched. */
export function toSnake<T = any>(value: any): T {
  if (Array.isArray(value)) return value.map((v) => toSnake(v)) as any
  if (value instanceof Date) return value as any
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(value)) {
      const nk = camelToSnake(k)
      out[nk] = CUSTOM_DATA_KEYS.has(k) ? v : toSnake(v)
    }
    return out as T
  }
  return value
}

/** SDK entity → plain snake_case object. */
export function entityToSnake<T = any>(entity: unknown): T {
  return toSnake<T>(JSON.parse(JSON.stringify(entity)))
}

// ── scalar parsers ────────────────────────────────────────────────────────────

export function parsePaddleDate(val: any): Date | undefined {
  if (!val) return undefined
  if (val instanceof Date) return isNaN(val.getTime()) ? undefined : val
  if (typeof val === 'number') {
    const d = new Date(val < 1e11 ? val * 1000 : val)
    return isNaN(d.getTime()) ? undefined : d
  }
  if (typeof val === 'string') {
    const trimmed = val.trim()
    if (!trimmed) return undefined
    const d = new Date(trimmed)
    return isNaN(d.getTime()) ? undefined : d
  }
  return undefined
}

/** Paddle amounts are strings of minor units ("4900"). Anything non-numeric is rejected, not zeroed. */
export function parseMinorAmount(amountRaw: any): number {
  if (amountRaw === null || amountRaw === undefined || amountRaw === '') return 0
  const num = Number(amountRaw)
  if (!Number.isFinite(num)) throw new UnresolvableEventError(`Non-numeric Paddle amount: ${String(amountRaw).slice(0, 20)}`)
  return Math.round(num)
}

// ── status ────────────────────────────────────────────────────────────────────

/** Strict: an unknown status must NOT silently become `active` (fail-open entitlement). */
export function mapPaddleSubscriptionStatus(paddleStatus: string): SubscriptionStatus {
  switch ((paddleStatus || '').toLowerCase()) {
    case 'active':   return SubscriptionStatus.active
    case 'trialing': return SubscriptionStatus.trialing
    case 'past_due': return SubscriptionStatus.past_due
    case 'paused':   return SubscriptionStatus.paused
    case 'canceled':
    case 'cancelled': return SubscriptionStatus.cancelled
    default:
      throw new UnresolvableEventError(`Unknown Paddle subscription status: ${String(paddleStatus).slice(0, 40)}`)
  }
}

// ── plan resolution ───────────────────────────────────────────────────────────

export interface ResolvedPlan {
  planId: PlanType
  interval: 'month' | 'year'
  source: 'price' | 'custom_data'
}

/**
 * Price ID is the authority (it is what Paddle actually bills). custom_data is only a fallback and is
 * never allowed to override a recognised price. Unresolvable ⇒ throw (never default to FREE: that would
 * silently downgrade a paying customer).
 */
export function resolvePlan(data: any): ResolvedPlan {
  const customData = data?.custom_data ?? {}
  const priceId: string | undefined = data?.items?.[0]?.price?.id ?? data?.items?.[0]?.price_id ?? data?.details?.line_items?.[0]?.price_id
  const priceMatch = priceId ? getPlanFromPriceId(priceId) : undefined

  if (priceMatch) return { planId: priceMatch.planId, interval: priceMatch.interval, source: 'price' }

  const cdPlan = customData.planId as PlanType | undefined
  if (cdPlan && (Object.values(PlanType) as string[]).includes(cdPlan) && cdPlan !== PlanType.FREE) {
    const cycle = data?.billing_cycle?.interval
    const interval: 'month' | 'year' = customData.interval === 'year' || cycle === 'year' ? 'year' : 'month'
    return { planId: cdPlan, interval, source: 'custom_data' }
  }

  throw new UnresolvableEventError(`Cannot resolve plan: price "${priceId ?? 'none'}" is not in PADDLE_PRICE_* configuration`)
}

// ── subscription snapshot ─────────────────────────────────────────────────────

export function extractSubscriptionData(
  data: any,
  plan: PlanType,
  interval: 'month' | 'year',
  now: Date = new Date()
): UpsertSubscriptionData {
  const paddleSubscriptionId = data.id as string
  const paddleCustomerId = data.customer_id as string
  if (!paddleSubscriptionId || !paddleCustomerId) {
    throw new UnresolvableEventError('Subscription payload without id/customer_id')
  }

  // Paddle semantics (developer.paddle.com, cancel guide): a portal / default API cancellation is a SCHEDULED change —
  // status stays "active" and scheduled_change.action = "cancel". Status "canceled" means the cancellation has taken
  // effect and access has ended (current_billing_period is null); it is never reinterpreted as "still paid-through".
  const status = mapPaddleSubscriptionStatus(data.status)
  const cancelAtPeriodEnd = status !== SubscriptionStatus.cancelled && data.scheduled_change?.action === 'cancel'
  const cancelledAt = parsePaddleDate(data.canceled_at)

  const period = data.current_billing_period
  const currentPeriodStart = parsePaddleDate(period?.starts_at ?? data.started_at ?? data.first_billed_at)
  let currentPeriodEnd = parsePaddleDate(period?.ends_at ?? data.next_billed_at)

  const item = data.items?.[0]
  const trialDates = item?.trial_dates ?? data.trial_dates
  const trialStart = parsePaddleDate(trialDates?.starts_at)
  const trialEnd = parsePaddleDate(trialDates?.ends_at)
  if (status === SubscriptionStatus.trialing && !currentPeriodEnd) currentPeriodEnd = trialEnd

  const unitPrice = item?.price?.unit_price
  const unitAmount = unitPrice?.amount ? parseMinorAmount(unitPrice.amount) : undefined

  const currency = String(data.currency_code ?? unitPrice?.currency_code ?? 'usd').toLowerCase()

  return {
    paddleSubscriptionId,
    paddleCustomerId,
    paddlePriceId: item?.price?.id ?? item?.price_id,
    plan,
    billingInterval: interval,
    status,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    cancelledAt,
    trialStart,
    trialEnd,
    unitAmount,
    currency,
  }
}
