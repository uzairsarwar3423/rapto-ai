import type { SubscriptionSnapshot, MrrMovement } from './metrics.types'

export const mrrCalculator = {
  calculateMrrMovement(yesterday: SubscriptionSnapshot[], today: SubscriptionSnapshot[]): MrrMovement {
    const yesterdayByTeam = new Map(yesterday.map((s) => [s.teamId, s]))
    const todayByTeam = new Map(today.map((s) => [s.teamId, s]))

    let newMrr = 0
    let expansionMrr = 0
    let contractionMrr = 0
    let churnedMrr = 0

    for (const [teamId, todaySub] of todayByTeam) {
      const yesterdaySub = yesterdayByTeam.get(teamId)
      if (!yesterdaySub) {
        newMrr += todaySub.amountCents
      } else if (todaySub.amountCents > yesterdaySub.amountCents) {
        expansionMrr += todaySub.amountCents - yesterdaySub.amountCents
      } else if (todaySub.amountCents < yesterdaySub.amountCents) {
        contractionMrr += yesterdaySub.amountCents - todaySub.amountCents
      }
    }

    for (const [teamId, yesterdaySub] of yesterdayByTeam) {
      const todaySub = todayByTeam.get(teamId)
      if (!todaySub || todaySub.status === 'cancelled') {
        churnedMrr += yesterdaySub.amountCents
      }
    }

    return {
      newMrr,
      expansionMrr,
      contractionMrr,
      churnedMrr,
      netMrr: newMrr + expansionMrr - contractionMrr - churnedMrr,
    }
  },

  sumActiveMrr(subscriptions: SubscriptionSnapshot[]): number {
    // Standard SaaS metric convention: trialing and past_due are explicitly EXCLUDED from MRR.
    // Do not "fix" this later without checking with finance — this is a deliberate definition,
    // not an oversight.
    return subscriptions.filter((s) => s.status === 'active').reduce((sum, s) => sum + s.amountCents, 0)
  },

  calculateArpu(mrrCents: number, activeSubscriptionCount: number): number {
    if (activeSubscriptionCount === 0) return 0 // zero-division guard — tested explicitly
    return Math.round(mrrCents / activeSubscriptionCount)
  },
}
