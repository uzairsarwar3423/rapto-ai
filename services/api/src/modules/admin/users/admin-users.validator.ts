import { z } from 'zod'

// User-typed % _ and \ are literals, not LIKE wildcards. Backslash first so the escapes added below survive.
export const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`)

const search = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((v) => (v ? escapeLike(v.toLowerCase()) : undefined))

const planTier = z.enum(['FREE', 'STARTER', 'GROWTH', 'BUSINESS', 'ENTERPRISE'])
const limit = z.coerce.number().int().min(1).max(100).default(25)
const cursor = z.string().max(512).optional()

export const listUsersSchema = z.object({
  search,
  role: z.enum(['OWNER', 'ADMIN', 'MANAGER', 'MEMBER']).optional(),
  planTier: planTier.optional(),
  teamId: z.string().min(1).max(64).optional(),
  status: z.enum(['ACTIVE', 'UNVERIFIED', 'SUSPENDED']).optional(),
  sortBy: z.enum(['createdAt', 'name', 'email']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  limit,
  cursor,
})

export const listTeamsSchema = z.object({
  search,
  plan: planTier.optional(),
  sortBy: z.enum(['createdAt', 'name', 'mrr']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  limit,
  cursor,
})

export type ListUsersQuery = z.output<typeof listUsersSchema>
export type ListTeamsQuery = z.output<typeof listTeamsSchema>
