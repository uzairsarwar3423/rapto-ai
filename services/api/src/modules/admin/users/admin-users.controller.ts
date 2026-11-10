import { asyncHandler } from '../../../utils/async-handler'
import { success } from '../../../utils/response'
import { adminUsersService as service } from './admin-users.service'
import type { ListUsersQuery, ListTeamsQuery } from './admin-users.validator'

// req.query has already been parsed + defaulted + sanitized by validate({ query }).

export const listUsers = asyncHandler(async (req, res) => {
  const data = await service.listUsers(req.query as unknown as ListUsersQuery)
  res.json(success(data))
})

export const listTeams = asyncHandler(async (req, res) => {
  const data = await service.listTeams(req.query as unknown as ListTeamsQuery)
  res.json(success(data))
})

export const getSummary = asyncHandler(async (_req, res) => {
  res.json(success(await service.getSummary()))
})
