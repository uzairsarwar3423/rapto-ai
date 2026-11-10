/**
 * Semantic admin audit actions. Raw HTTP writes are logged by adminAuditMiddleware as `METHOD:/path`; these are the
 * human-meaningful events that GET requests (which that middleware skips) and domain actions record explicitly.
 */
export const AUDIT_ACTIONS = {
  USER_VIEWED: 'user.viewed',
  TEAM_VIEWED: 'team.viewed',
} as const

export type AuditViewAction = typeof AUDIT_ACTIONS.USER_VIEWED | typeof AUDIT_ACTIONS.TEAM_VIEWED
export type AuditTargetType = 'user' | 'team'
