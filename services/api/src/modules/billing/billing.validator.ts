// ─────────────────────────────────────────────────────────────────────────────
// billing.validator.ts — Zod Validation Schemas
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod'
import { PlanType } from '@prisma/client'

// POST /billing/checkout
// FREE and ENTERPRISE are deliberately excluded:
//   FREE  → no payment required
//   ENTERPRISE → custom sales quote, handled outside this endpoint
export const checkoutSchema = z.object({
  planId: z.enum([PlanType.STARTER, PlanType.GROWTH, PlanType.BUSINESS] as const),
  interval: z.enum(['month', 'year'] as const),
})

// GET /billing/invoices — cursor pagination
export const invoicePaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 20))
    .pipe(z.number().int().min(1).max(100)),
})

export type CheckoutInput = z.infer<typeof checkoutSchema>
export type InvoicePaginationInput = z.infer<typeof invoicePaginationSchema>
