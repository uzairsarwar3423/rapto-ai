// Builders for Paddle Billing webhook bodies (snake_case, as Paddle sends them).
let seq = 0
export const uid = (p: string) =>
  `${p}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

export const DAY = 24 * 60 * 60 * 1000

export const PRICES = {
  STARTER_M: 'pri_starter_m',
  GROWTH_M: 'pri_growth_m',
  BUSINESS_M: 'pri_business_m',
  UNKNOWN: 'pri_not_configured',
}

export function envelope(eventType: string, data: any, opts: { eventId?: string; occurredAt?: Date } = {}) {
  return {
    event_id: opts.eventId ?? uid('evt'),
    event_type: eventType,
    occurred_at: (opts.occurredAt ?? new Date()).toISOString(),
    notification_id: uid('ntf'),
    data,
  }
}

export interface SubOpts {
  id: string
  customerId?: string
  teamId?: string
  status: 'active' | 'trialing' | 'past_due' | 'paused' | 'canceled'
  priceId?: string
  periodStart?: Date
  periodEnd?: Date | null
  trialStart?: Date
  trialEnd?: Date
  scheduledCancel?: boolean
}

export function subscription(o: SubOpts) {
  const start = o.periodStart ?? new Date()
  return {
    id: o.id,
    status: o.status,
    customer_id: o.customerId ?? 'ctm_test',
    currency_code: 'USD',
    started_at: start.toISOString(),
    next_billed_at: o.periodEnd ? o.periodEnd.toISOString() : null,
    canceled_at: o.status === 'canceled' ? new Date().toISOString() : null,
    scheduled_change: o.scheduledCancel ? { action: 'cancel', effective_at: o.periodEnd?.toISOString() } : null,
    current_billing_period: o.periodEnd
      ? { starts_at: start.toISOString(), ends_at: o.periodEnd.toISOString() }
      : null,
    billing_cycle: { interval: 'month', frequency: 1 },
    custom_data: o.teamId ? { teamId: o.teamId, planId: 'STARTER', interval: 'month' } : null,
    items: [
      {
        price: {
          id: o.priceId ?? PRICES.STARTER_M,
          unit_price: { amount: '4900', currency_code: 'USD' },
          trial_period: o.status === 'trialing' ? { interval: 'day', frequency: 14 } : null,
        },
        trial_dates:
          o.status === 'trialing'
            ? {
                starts_at: (o.trialStart ?? start).toISOString(),
                ends_at: (o.trialEnd ?? o.periodEnd ?? new Date()).toISOString(),
              }
            : null,
        quantity: 1,
      },
    ],
  }
}

export function transaction(o: {
  id: string
  subscriptionId?: string
  customerId?: string
  teamId: string
  total: string
  priceId?: string
  periodStart?: Date
  periodEnd?: Date
  trial?: boolean
}) {
  return {
    id: o.id,
    status: 'completed',
    customer_id: o.customerId ?? 'ctm_test',
    subscription_id: o.subscriptionId ?? null,
    currency_code: 'USD',
    billed_at: new Date().toISOString(),
    billing_period:
      o.periodStart && o.periodEnd
        ? { starts_at: o.periodStart.toISOString(), ends_at: o.periodEnd.toISOString() }
        : null,
    custom_data: { teamId: o.teamId, planId: 'STARTER', interval: 'month' },
    items: [
      {
        price: {
          id: o.priceId ?? PRICES.STARTER_M,
          unit_price: { amount: '4900', currency_code: 'USD' },
          trial_period: o.trial ? { interval: 'day', frequency: 14 } : null,
        },
      },
    ],
    details: { totals: { subtotal: o.total, total: o.total, grand_total: o.total } },
  }
}

export function adjustment(o: {
  id: string
  transactionId: string
  action?: string
  status: string
  total: string
  customerId?: string
}) {
  return {
    id: o.id,
    transaction_id: o.transactionId,
    action: o.action ?? 'refund',
    status: o.status,
    customer_id: o.customerId ?? 'ctm_test',
    currency_code: 'USD',
    reason: 'customer_request',
    totals: { total: o.total },
  }
}
