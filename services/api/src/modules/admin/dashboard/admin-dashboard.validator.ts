import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')

export const dateRangeSchema = z.object({
  from: isoDate,
  to: isoDate,
}).refine((v) => v.from <= v.to, { message: '`from` must be on or before `to`', path: ['from'] })

export const trendQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
  granularity: z.enum(['day', 'week', 'month']).default('day'),
}).refine((v) => v.from <= v.to, { message: '`from` must be on or before `to`', path: ['from'] })

export const cohortQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(12),
})

export const topTeamsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  by: z.enum(['mrr', 'revenue']).default('mrr'),
})

export const planMixQuerySchema = z.object({
  at: isoDate.optional(), // defaults to today inside the service if omitted
})
