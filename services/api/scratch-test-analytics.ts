import { analyticsRepository } from './src/modules/analytics/analytics.repository'
import { prisma } from './src/db/client'

async function run() {
  const teamId = 'cmr91tvwb000dh2ajv379ofgu'
  const from = new Date('2026-06-01')
  const to = new Date('2026-07-30')

  console.log('Testing getOverviewAggregates...')
  try {
    const res = await analyticsRepository.getOverviewAggregates(teamId, from, to)
    console.log('Overview Aggregates Result:', res)
  } catch (err: any) {
    console.error('getOverviewAggregates Error:', err)
  }

  console.log('\nTesting getMemberBreakdown...')
  try {
    const res = await analyticsRepository.getMemberBreakdown(teamId, from, to)
    console.log('Member Breakdown Result:', res)
  } catch (err: any) {
    console.error('getMemberBreakdown Error:', err)
  }

  console.log('\nTesting getTrendPoints...')
  try {
    const res = await analyticsRepository.getTrendPoints(teamId, 'fulfillmentRate', 'week', from, to)
    console.log('Trend Points Result:', res)
  } catch (err: any) {
    console.error('getTrendPoints Error:', err)
  }

  await prisma.$disconnect()
}

run().catch(console.error)
