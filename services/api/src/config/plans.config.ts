// ─────────────────────────────────────────────────────────────────────────────
// plans.config.ts — Paddle Price Map (replaces Stripe price map)
//
// PADDLE_PRICE_MAP: planId + interval → Paddle Price ID (set in Paddle dashboard)
// PADDLE_PRICE_REVERSE_MAP: built ONCE at module load for O(1) webhook lookups
//
// PLAN_LIMITS itself is UNCHANGED — provider-agnostic business limits.
// The only thing that changed from a Stripe design is STRIPE_PRICE_MAP → PADDLE_PRICE_MAP.
// ─────────────────────────────────────────────────────────────────────────────

import { PlanType } from '@prisma/client'

// ── Plan Limit Shape ──────────────────────────────────────────────────────────

export interface PlanLimits {
  /** Max meetings per billing cycle. -1 = unlimited. */
  meetings: number
  /** Max team members (active + accepted). -1 = unlimited. */
  members: number
  /** Days of history retained. -1 = unlimited. */
  historyDays: number
  /** Max third-party integrations (Jira, Slack, Linear, Notion). -1 = unlimited. */
  integrations: number
  /** Storage in GB. -1 = unlimited. */
  storageGB: number
  /** Whether REST API access and webhook registrations are allowed. */
  apiAccess: boolean
  /** Whether SSO (SAML/SCIM) is enabled. */
  ssoEnabled: boolean
  /** Monthly price in USD cents. -1 = custom/contact sales. */
  monthlyPriceCents: number
}

// ── Plan Limits Table ─────────────────────────────────────────────────────────
//
//                  FREE    STARTER    GROWTH    BUSINESS    ENTERPRISE
// meetings/month:    5        40        120        300           -1
// members/team:      3        10         25         60           -1
// historyDays:       7        90        365         -1           -1
// integrations:      1        -1         -1         -1           -1
// storageGB:         1        10         50         -1           -1
// apiAccess:       false    false      false       true         true
// ssoEnabled:      false    false      false      false         true
// monthlyPrice:      $0       $49        $99       $199         custom
//
// Source: web/src/lib/marketing/content/pricing.content.ts

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  FREE: {
    meetings: 5,
    members: 3,
    historyDays: 7,
    integrations: 1,
    storageGB: 1,
    apiAccess: false,
    ssoEnabled: false,
    monthlyPriceCents: 0,
  },

  STARTER: {
    meetings: 40,
    members: 10,
    historyDays: 90,
    integrations: -1,
    storageGB: 10,
    apiAccess: false,
    ssoEnabled: false,
    monthlyPriceCents: 4900,
  },

  GROWTH: {
    meetings: 120,
    members: 25,
    historyDays: 365,
    integrations: -1,
    storageGB: 50,
    apiAccess: false,
    ssoEnabled: false,
    monthlyPriceCents: 9900,
  },

  BUSINESS: {
    meetings: 300,
    members: 60,
    historyDays: -1,
    integrations: -1,
    storageGB: -1,
    apiAccess: true,
    ssoEnabled: false,
    monthlyPriceCents: 19900,
  },

  ENTERPRISE: {
    meetings: -1,
    members: -1,
    historyDays: -1,
    integrations: -1,
    storageGB: -1,
    apiAccess: true,
    ssoEnabled: true,
    monthlyPriceCents: -1,
  },
} as const

// ── Paddle Price Map — the ONLY provider-specific section ─────────────────────
//
// Price IDs are created in the Paddle dashboard → Catalog → Prices.
// One price per plan per billing interval.
// Set via environment variables so they can differ between sandbox and production.

export const PADDLE_PRICE_MAP: Record<
  Exclude<PlanType, 'FREE' | 'ENTERPRISE'>,
  { month: string; year: string }
> = {
  STARTER: {
    month: process.env.PADDLE_PRICE_STARTER_M ?? '',
    year:  process.env.PADDLE_PRICE_STARTER_Y ?? '',
  },
  GROWTH: {
    month: process.env.PADDLE_PRICE_GROWTH_M ?? '',
    year:  process.env.PADDLE_PRICE_GROWTH_Y ?? '',
  },
  BUSINESS: {
    month: process.env.PADDLE_PRICE_BUSINESS_M ?? '',
    year:  process.env.PADDLE_PRICE_BUSINESS_Y ?? '',
  },
}

// ── Reverse lookup map: priceId → { planId, interval } ───────────────────────
//
// Built ONCE at module load — O(1) lookup in every webhook handler.
// Never rebuilt per request. Never scanned linearly.

export type PriceReverseEntry = {
  planId: PlanType
  interval: 'month' | 'year'
}

function buildReversePriceMap(): Map<string, PriceReverseEntry> {
  const map = new Map<string, PriceReverseEntry>()
  const plans = ['STARTER', 'GROWTH', 'BUSINESS'] as const
  for (const planId of plans) {
    const { month, year } = PADDLE_PRICE_MAP[planId]
    if (month) map.set(month, { planId: planId as PlanType, interval: 'month' })
    if (year)  map.set(year,  { planId: planId as PlanType, interval: 'year' })
  }
  return map
}

export const PADDLE_PRICE_REVERSE_MAP = buildReversePriceMap()

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getPlanLimit<K extends keyof PlanLimits>(
  plan: PlanType,
  resource: K
): PlanLimits[K] {
  return PLAN_LIMITS[plan][resource]
}

export function isUnlimited(plan: PlanType, resource: keyof PlanLimits): boolean {
  return (PLAN_LIMITS[plan][resource] as number) === -1
}

export function isLimitExceeded(
  plan: PlanType,
  resource: keyof PlanLimits,
  currentUsage: number
): boolean {
  const limit = PLAN_LIMITS[plan][resource] as number
  if (limit === -1) return false
  return currentUsage >= limit
}

export function getUpgradeUrl(currentPlan: PlanType): string {
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000'
  return `${frontendUrl}/settings/billing?current=${currentPlan}`
}

export const PLAN_ORDER: PlanType[] = [
  PlanType.FREE,
  PlanType.STARTER,
  PlanType.GROWTH,
  PlanType.BUSINESS,
  PlanType.ENTERPRISE,
]

export function isPlanHigherThan(planA: PlanType, planB: PlanType): boolean {
  return PLAN_ORDER.indexOf(planA) > PLAN_ORDER.indexOf(planB)
}

export const RESERVED_SLUGS = new Set([
  'api', 'admin', 'app', 'www', 'mail', 'dev', 'staging', 'dashboard',
  'login', 'register', 'vocaply', 'support', 'help', 'blog', 'pricing',
  'about', 'contact', 'terms', 'privacy', 'docs', 'status', 'health',
  'metrics', 'internal', 'onboarding', 'invite', 'settings', 'billing',
  'analytics', 'reports',
])

export const ROLE_LEVELS: Record<string, number> = {
  OWNER: 4,
  ADMIN: 3,
  MANAGER: 2,
  MEMBER: 1,
} as const

export const DEFAULT_NOTIFICATION_PREFERENCES = {
  emailOnCommitmentMissed: true,
  emailOnDeadlineToday: true,
  emailOnDeadlineTomorrow: true,
  emailWeeklyDigest: true,
  weeklyDigestDay: 'MONDAY',
  slackOnCommitmentMissed: true,
  slackOnDeadlineToday: true,
  inAppAll: true,
} as const
