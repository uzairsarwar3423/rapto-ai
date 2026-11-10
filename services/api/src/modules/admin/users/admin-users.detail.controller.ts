import { asyncHandler } from '../../../utils/async-handler'
import { success } from '../../../utils/response'
import { adminUsersDetailService as service } from './admin-users.detail.service'
import { auditViewOnce } from '../shared/view-audit'
import { AUDIT_ACTIONS } from '../shared/audit-actions'

export const getUserDetail = asyncHandler(async (req, res) => {
  const userId = String(req.params.userId)
  const data = await service.getUserDetail(userId)
  // Only reached for an existing user. Fire-and-forget: the audit write must never add latency or failure to a read.
  if (req.adminUser) void Promise.resolve(auditViewOnce(req.adminUser.id, AUDIT_ACTIONS.USER_VIEWED, { type: 'user', id: userId }, req.ip)).catch(() => undefined)
  res.json(success(data))
})

export const getTeamDetail = asyncHandler(async (req, res) => {
  const teamId = String(req.params.teamId)
  const data = await service.getTeamDetail(teamId)
  if (req.adminUser) void Promise.resolve(auditViewOnce(req.adminUser.id, AUDIT_ACTIONS.TEAM_VIEWED, { type: 'team', id: teamId }, req.ip)).catch(() => undefined)
  res.json(success(data))
})
