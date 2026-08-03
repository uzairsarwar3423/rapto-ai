/**
 * backfill-external-commitments.ts
 *
 * ONE-TIME DATA CORRECTION SCRIPT
 *
 * Context:
 *   A bug in extract.worker.ts caused commitments from external participants
 *   (non-team-members like "Zain") to be stored as Action Items instead of
 *   Commitments. This was the "fallback to Action Item" behavior.
 *
 *   Fix applied: extract.worker.ts now always stores extracted commitments
 *   as Commitment records with ownerId=null + ownerNameRaw set.
 *
 * What this script does:
 *   1. Lists all meetings with action items where assigneeId=null
 *      and assigneeNameRaw != null (potential misfiled external commitments)
 *   2. Prints meeting IDs and action item counts for review
 *   3. With --reprocess flag: lists meeting IDs to reprocess via admin
 *
 * Usage:
 *   npx ts-node backfill-external-commitments.ts [--dry-run] [--teamId=<id>]
 *   npx ts-node backfill-external-commitments.ts --reprocess [--teamId=<id>]
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const args = process.argv.slice(2)
  const isDryRun = !args.includes('--reprocess')
  const teamIdFilter = args.find(a => a.startsWith('--teamId='))?.split('=')[1]

  console.log('='.repeat(60))
  console.log('External Participant Commitment Backfill Analysis')
  console.log('='.repeat(60))
  console.log(`Mode: ${isDryRun ? 'DRY RUN (analysis only)' : 'REPROCESS MODE'}`)
  if (teamIdFilter) console.log(`Team filter: ${teamIdFilter}`)
  console.log()

  // Find action items that have assigneeNameRaw set but no assigneeId
  // These are the "misfiled commitments" from external participants
  const suspectActionItems = await prisma.actionItem.findMany({
    where: {
      assigneeId: null,
      assigneeNameRaw: { not: null },
      ...(teamIdFilter ? { teamId: teamIdFilter } : {}),
    },
    select: {
      id: true,
      meetingId: true,
      teamId: true,
      text: true,
      assigneeNameRaw: true,
      createdAt: true,
      meeting: {
        select: { id: true, title: true, status: true, scheduledAt: true }
      }
    },
    orderBy: { createdAt: 'desc' },
  })

  if (suspectActionItems.length === 0) {
    console.log('✅ No suspect action items found. Database looks clean.')
    return
  }

  // Group by meeting
  const byMeeting = new Map<string, typeof suspectActionItems>()
  for (const item of suspectActionItems) {
    const existing = byMeeting.get(item.meetingId) ?? []
    existing.push(item)
    byMeeting.set(item.meetingId, existing)
  }

  console.log(`Found ${suspectActionItems.length} action items with external assignees across ${byMeeting.size} meetings:\n`)

  for (const [meetingId, items] of byMeeting.entries()) {
    const meeting = items[0].meeting
    console.log(`Meeting: ${meetingId}`)
    console.log(`  Title: ${meeting?.title ?? 'Unknown'}`)
    console.log(`  Status: ${meeting?.status ?? 'Unknown'}`)
    console.log(`  Date: ${meeting?.scheduledAt?.toISOString() ?? 'Unknown'}`)
    console.log(`  External-assignee action items: ${items.length}`)
    items.forEach(item => {
      console.log(`    - [${item.assigneeNameRaw}] "${item.text.substring(0, 80)}${item.text.length > 80 ? '...' : ''}"`)
    })
    console.log()
  }

  if (isDryRun) {
    console.log('-'.repeat(60))
    console.log('DRY RUN COMPLETE. No changes made.')
    console.log()
    console.log('To reprocess these meetings (which will correctly create')
    console.log('Commitment records for external participants), run:')
    console.log()
    console.log('  npx ts-node backfill-external-commitments.ts --reprocess')
    console.log()
    console.log('NOTE: Reprocessing re-runs AI extraction on the transcript.')
    console.log('New Commitment records will be created for external participants.')
    console.log('The existing misfiled Action Items will remain until manual cleanup.')
  } else {
    console.log('-'.repeat(60))
    console.log('Meeting IDs to reprocess via admin API:')
    for (const meetingId of byMeeting.keys()) {
      console.log(`  POST /api/v1/meetings/${meetingId}/reprocess`)
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
