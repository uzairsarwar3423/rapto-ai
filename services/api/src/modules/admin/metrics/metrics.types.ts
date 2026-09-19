export interface SubscriptionSnapshot {
  teamId: string
  planId: string
  amountCents: number
  status: 'active' | 'trialing' | 'past_due' | 'cancelled'
}

export interface MrrMovement {
  newMrr: number
  expansionMrr: number
  contractionMrr: number
  churnedMrr: number
  netMrr: number
}
