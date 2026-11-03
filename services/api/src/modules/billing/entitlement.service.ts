// ─────────────────────────────────────────────────────────────────────────────
// entitlement.service.ts — DB-backed accessors for the effective plan.
//
// Every API gate (meeting quota, member invites, integrations, usage/plan display) reads the plan
// through here, so an expired trial / ended cancellation loses access at the exact boundary even if the
// cron sweeper or a webhook has not run yet (read-time enforcement, server clock).
// ─────────────────────────────────────────────────────────────────────────────

import { PlanType } from '@prisma/client'
import { prisma } from '../../db/client'
import { resolveEntitlement, type Entitlement } from './entitlement'

export async function getTeamEntitlement(teamId: string, now: Date = new Date()): Promise<Entitlement> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      plan: true,
      gracePeriodEnd: true,
      subscription: {
        select: { status: true, plan: true, trialEnd: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
      },
    },
  })
  if (!team) return { plan: PlanType.FREE, reason: 'no_subscription', validUntil: null }
  return resolveEntitlement(
    { teamPlan: team.plan, gracePeriodEnd: team.gracePeriodEnd, subscription: team.subscription },
    now
  )
}

export async function getEffectivePlan(teamId: string): Promise<PlanType> {
  return (await getTeamEntitlement(teamId)).plan
}
