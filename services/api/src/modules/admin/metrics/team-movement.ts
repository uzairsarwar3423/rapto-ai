import type { SubscriptionSnapshot } from './metrics.types'

/**
 * Definition (kept in exactly one place — change `isPaying` and nothing else):
 * a team is "paying" when its snapshot status is `active`. `trialing` and `past_due` are NOT paying, which matches
 * `mrrCalculator.sumActiveMrr`, so MRR and logo churn can never disagree about who counts.
 *
 * "churned" therefore means paying → not paying. A team moving active → past_due counts as churned until it recovers.
 */
const isPaying = (s?: SubscriptionSnapshot): boolean => !!s && s.status === 'active'

export interface TeamMovement {
  newPaying: number
  churned: number
  activeAtStart: number
  activeNow: number
}

export function countTeamMovement(prev: SubscriptionSnapshot[], today: SubscriptionSnapshot[]): TeamMovement {
  const prevMap = new Map(prev.map((s) => [s.teamId, s]))
  const todayMap = new Map(today.map((s) => [s.teamId, s]))

  let newPaying = 0
  let churned = 0
  for (const [teamId, t] of todayMap) if (isPaying(t) && !isPaying(prevMap.get(teamId))) newPaying++
  for (const [teamId, p] of prevMap) if (isPaying(p) && !isPaying(todayMap.get(teamId))) churned++

  return {
    newPaying,
    churned,
    activeAtStart: prev.filter(isPaying).length,
    activeNow: today.filter(isPaying).length,
  }
}
