// DB helpers for billing integration tests (real Postgres, throwaway database).
import './billing-test-env'
import { prisma } from '../../src/db/client'

export async function resetBillingTables() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "refunds","invoices","billing_audit_logs","paddle_webhook_events","subscriptions","users","teams" RESTART IDENTITY CASCADE'
  )
}

export async function makeTeam(opts: { plan?: any; paddleCustomerId?: string | null; meetingsUsed?: number } = {}) {
  const id = Math.random().toString(36).slice(2, 9)
  return prisma.team.create({
    data: {
      name: `Team ${id}`,
      slug: `team-${id}`,
      plan: opts.plan ?? 'FREE',
      paddleCustomerId: opts.paddleCustomerId === undefined ? `ctm_${id}` : opts.paddleCustomerId,
      meetingsUsed: opts.meetingsUsed ?? 0,
    },
  })
}

export async function makeUser(teamId: string | null, role: 'OWNER' | 'ADMIN' | 'MEMBER' = 'ADMIN') {
  const id = Math.random().toString(36).slice(2, 9)
  return prisma.user.create({ data: { email: `u-${id}@rapto.dev`, name: `User ${id}`, teamId, role } })
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
export { prisma }
