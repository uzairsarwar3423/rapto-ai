import { asyncHandler } from '../../../utils/async-handler'
import { success } from '../../../utils/response'
import { adminDashboardService as service } from './admin-dashboard.service'
import type { Granularity } from './admin-dashboard.types'

export const getOverview = asyncHandler(async (req, res) => {
  const { from, to } = req.query as { from: string; to: string }
  const data = await service.getOverview(from, to)
  res.json(success(data))
})

export const getRevenueTrend = asyncHandler(async (req, res) => {
  const { from, to, granularity } = req.query as {
    from: string
    to: string
    granularity: Granularity
  }
  const data = await service.getRevenueTrend(from, to, granularity ?? 'day')
  res.json(success(data))
})

export const getMrrTrend = asyncHandler(async (req, res) => {
  const { from, to, granularity } = req.query as {
    from: string
    to: string
    granularity: Granularity
  }
  const data = await service.getMrrTrend(from, to, granularity ?? 'day')
  res.json(success(data))
})

export const getMrrMovement = asyncHandler(async (req, res) => {
  const { from, to } = req.query as { from: string; to: string }
  const data = await service.getMrrMovement(from, to)
  res.json(success(data))
})

export const getPlanMix = asyncHandler(async (req, res) => {
  const { at } = req.query as { at?: string }
  const data = await service.getPlanMix(at)
  res.json(success(data))
})

export const getCohortRetention = asyncHandler(async (req, res) => {
  const { months } = req.query as unknown as { months: number }
  const data = await service.getCohortRetention(Number(months) || 12)
  res.json(success(data))
})

export const getTopTeams = asyncHandler(async (req, res) => {
  const { limit } = req.query as unknown as { limit: number }
  const data = await service.getTopTeams(Number(limit) || 10)
  res.json(success(data))
})
