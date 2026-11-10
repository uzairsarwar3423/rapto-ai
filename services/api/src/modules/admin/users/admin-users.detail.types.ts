import type { UserStatus } from './admin-users.repository'

export interface AdminUserDetail {
  id: string
  name: string
  email: string
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'MEMBER'
  emailVerified: boolean
  createdAt: string
  lastActiveAt: string | null
  timezone: string | null
  avatarUrl: string | null
  status: UserStatus
  suspension: null | { reason: string; suspendedAt: string; suspendedByName: string }
  team: null | { id: string; name: string; slug: string; plan: string }
  /** Existing denormalized users.commitmentScore. */
  commitmentScore: number | null
  stats: { commitmentsTotal: number; fulfilled: number; missed: number; pending: number }
  /** ≤5 active sessions. Never token hashes. */
  sessions: Array<{ id: string; ipAddress: string | null; userAgent: string | null; lastUsedAt: string | null; createdAt: string }>
  /** ≤10 audit rows targeting this user. */
  staffActivity: Array<{ id: string; action: string; actorName: string | null; reason: string | null; createdAt: string }>
}

export interface AdminTeamDetail {
  id: string
  name: string
  slug: string
  createdAt: string
  owner: { id: string; name: string; email: string } | null
  plan: string
  subscription: null | {
    id: string
    status: string
    interval: 'month' | 'year'
    /** Price per billing interval. */
    amountCents: number
    /** Monthly-normalized, and 0 unless the subscription is active (same definition as platform MRR). */
    mrrCents: number
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean
  }
  seats: { used: number; limit: number | null }
  usage: { meetingsUsed: number; meetingLimit: number | null }
  health: null | { score: number; trend: 'improving' | 'stable' | 'declining' }
  /** Provider NAMES only — never tokens, never metadata blobs. */
  integrations: string[]
  /** Up to 12 month-end points, ascending. */
  mrrHistory: Array<{ date: string; mrrCents: number }>
  /** Set when any returned month predates the platform's first LIVE snapshot (history there is reconstructed). */
  mrrHistoryReconstructedBefore: string | null
}
