/**
 * scripts/create-staff.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CLI utility to create or update internal staff members (AdminUser).
 *
 * Usage via CLI arguments:
 *   npx tsx scripts/create-staff.ts email=finance@rapto.cloud password=MyPassword123! name="Ali Khan" role=FINANCE
 *
 * Usage via Environment Variables:
 *   STAFF_EMAIL=finance@rapto.cloud STAFF_PASSWORD=MyPassword123! STAFF_NAME="Ali Khan" STAFF_ROLE=FINANCE npx tsx scripts/create-staff.ts
 *
 * Available Roles:
 *   - SUPER_ADMIN : Full platform access and destructive controls
 *   - FINANCE     : Subscription, MRR/ARR, billing metrics & revenue management
 *   - SUPPORT     : User and team lookup, impersonation & diagnostics
 *   - READONLY    : View-only console access
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

const VALID_ROLES = ['SUPER_ADMIN', 'FINANCE', 'SUPPORT', 'READONLY'] as const
type AdminRole = (typeof VALID_ROLES)[number]

function parseArgs(): { email?: string; password?: string; name?: string; role?: AdminRole } {
  const args = process.argv.slice(2)
  const parsed: Record<string, string> = {}

  for (const arg of args) {
    const [key, ...rest] = arg.split('=')
    if (key && rest.length > 0) {
      parsed[key.toLowerCase().trim()] = rest.join('=').trim()
    }
  }

  const email = parsed['email'] || process.env.STAFF_EMAIL
  const password = parsed['password'] || process.env.STAFF_PASSWORD
  const name = parsed['name'] || process.env.STAFF_NAME || 'Staff Member'
  const role = (parsed['role'] || process.env.STAFF_ROLE || 'SUPPORT').toUpperCase() as AdminRole

  return { email, password, name, role }
}

async function main() {
  const { email, password, name, role } = parseArgs()

  if (!email || !password) {
    console.error('\n❌ Missing required fields.')
    console.log('\nUsage:')
    console.log('  npx tsx scripts/create-staff.ts email=<email> password=<password> name="<name>" role=<SUPER_ADMIN|FINANCE|SUPPORT|READONLY>\n')
    process.exit(1)
  }

  if (password.length < 12) {
    console.error('\n❌ Password must be at least 12 characters long for staff accounts.\n')
    process.exit(1)
  }

  if (!VALID_ROLES.includes(role)) {
    console.error(`\n❌ Invalid role "${role}". Must be one of: ${VALID_ROLES.join(', ')}\n`)
    process.exit(1)
  }

  const passwordHash = await bcrypt.hash(password, 12)

  const admin = await (prisma as any).adminUser.upsert({
    where: { email },
    create: {
      email,
      name,
      passwordHash,
      role,
      mfaEnabled: false, // Enrolled on first login via QR code
    },
    update: {
      name,
      passwordHash,
      role,
      disabledAt: null, // Re-enable if previously disabled
    },
  })

  console.log('\n======================================================')
  console.log('✓ Staff User Created / Updated Successfully!')
  console.log('======================================================')
  console.log(`  Name:        ${admin.name}`)
  console.log(`  Email:       ${admin.email}`)
  console.log(`  Role:        ${admin.role}`)
  console.log(`  MFA Status:  ${admin.mfaEnabled ? 'Enrolled' : 'Pending First Login (QR Code)'}`)
  console.log('======================================================')
  console.log('💡 First Login Instructions:')
  console.log(`  1. Staff member navigates to /login`)
  console.log(`  2. Enters email and password`)
  console.log(`  3. Scans the generated QR code into an authenticator app (1Password, Google Authenticator)`)
  console.log(`  4. Enters the 6-digit code to complete setup\n`)
}

main()
  .catch((err) => {
    console.error('❌ Error creating staff user:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
