/**
 * scripts/seed-admin.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Idempotent admin seed script.
 *
 * Creates:
 *   1. One AdminUser with role SUPER_ADMIN
 *   2. 91 rows of PlatformMetricsDaily (90 days back → today)
 *
 * Idempotency contract:
 *   - admin_users   → upsert on email (re-running hashes a new password)
 *   - platform_metrics_daily → upsert with update:{} (existing rows NEVER overwritten;
 *     delete FROM platform_metrics_daily manually if a clean-slate is needed)
 *
 * Usage:
 *   SEED_ADMIN_EMAIL=you@rapto.com SEED_ADMIN_PASSWORD=<12+chars> npx tsx scripts/seed-admin.ts
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function subDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - days)
  d.setUTCHours(0, 0, 0, 0) // normalize to midnight UTC so Postgres DATE column is stable
  return d
}

async function main() {
  // ── Guard: reject unsafe invocations ─────────────────────────────────────
  const email    = process.env.SEED_ADMIN_EMAIL
  const password = process.env.SEED_ADMIN_PASSWORD

  if (!email || !password) {
    throw new Error(
      'SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set. ' +
      'Refusing to create an admin account with a default or empty password.',
    )
  }

  if (password.length < 12) {
    throw new Error(
      'SEED_ADMIN_PASSWORD must be at least 12 characters for a SUPER_ADMIN seed account.',
    )
  }

  // ── Step 1: Upsert SUPER_ADMIN ────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(password, 12)

  const admin = await (prisma as any).adminUser.upsert({
    where: { email },
    create: {
      email,
      name: 'Platform Owner',
      passwordHash,
      role: 'SUPER_ADMIN',
      mfaEnabled: false, // enrolled on first real login (Day 2) — never pre-seeded
    },
    update: {
      passwordHash, // re-running with a new password rotates it — expected
    },
  })

  console.log(`✓ admin_users: ${admin.email} (${admin.role})`)
  console.log('✓ platform_metrics_daily seeding skipped — using real database records')
}

main()
  .catch((err: Error) => {
    console.error('❌ Seed failed:', err.message)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
