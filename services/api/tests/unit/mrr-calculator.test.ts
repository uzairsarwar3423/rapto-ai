import { mrrCalculator } from '../../src/modules/admin/metrics/mrr-calculator.service'

describe('mrrCalculator.calculateMrrMovement', () => {
  it('counts a subscription with no prior-day record as newMrr', () => {
    const result = mrrCalculator.calculateMrrMovement(
      [],
      [{ teamId: 't1', planId: 'growth', amountCents: 9900, status: 'active' }]
    )
    expect(result.newMrr).toBe(9900)
    expect(result.expansionMrr).toBe(0)
    expect(result.contractionMrr).toBe(0)
    expect(result.churnedMrr).toBe(0)
    expect(result.netMrr).toBe(9900)
  })

  it('counts an amount increase for an existing team as expansionMrr', () => {
    const result = mrrCalculator.calculateMrrMovement(
      [{ teamId: 't1', planId: 'starter', amountCents: 4900, status: 'active' }],
      [{ teamId: 't1', planId: 'growth', amountCents: 9900, status: 'active' }]
    )
    expect(result.expansionMrr).toBe(5000)
    expect(result.newMrr).toBe(0)
    expect(result.contractionMrr).toBe(0)
    expect(result.churnedMrr).toBe(0)
    expect(result.netMrr).toBe(5000)
  })

  it('counts an amount decrease for an existing team as contractionMrr', () => {
    const result = mrrCalculator.calculateMrrMovement(
      [{ teamId: 't1', planId: 'growth', amountCents: 9900, status: 'active' }],
      [{ teamId: 't1', planId: 'starter', amountCents: 4900, status: 'active' }]
    )
    expect(result.contractionMrr).toBe(5000)
    expect(result.newMrr).toBe(0)
    expect(result.expansionMrr).toBe(0)
    expect(result.churnedMrr).toBe(0)
    expect(result.netMrr).toBe(-5000)
  })

  it('counts a missing-today team as churnedMrr', () => {
    const result = mrrCalculator.calculateMrrMovement(
      [{ teamId: 't1', planId: 'growth', amountCents: 9900, status: 'active' }],
      []
    )
    expect(result.churnedMrr).toBe(9900)
    expect(result.newMrr).toBe(0)
    expect(result.expansionMrr).toBe(0)
    expect(result.contractionMrr).toBe(0)
    expect(result.netMrr).toBe(-9900)
  })

  it('counts a cancelled status today as churnedMrr', () => {
    const result = mrrCalculator.calculateMrrMovement(
      [{ teamId: 't1', planId: 'growth', amountCents: 9900, status: 'active' }],
      [{ teamId: 't1', planId: 'growth', amountCents: 9900, status: 'cancelled' }]
    )
    expect(result.churnedMrr).toBe(9900)
    expect(result.netMrr).toBe(-9900)
  })

  it('nets all four buckets correctly into netMrr', () => {
    const result = mrrCalculator.calculateMrrMovement(
      [{ teamId: 't1', planId: 'growth', amountCents: 9900, status: 'active' }],
      [{ teamId: 't2', planId: 'starter', amountCents: 4900, status: 'active' }]
    )
    expect(result.newMrr).toBe(4900)
    expect(result.churnedMrr).toBe(9900)
    expect(result.netMrr).toBe(4900 - 9900)
  })
})

describe('mrrCalculator.calculateArpu — zero-division guard', () => {
  it('returns 0, not NaN or Infinity, when there are no active subscriptions', () => {
    expect(mrrCalculator.calculateArpu(50000, 0)).toBe(0)
  })

  it('divides correctly with a non-zero denominator', () => {
    expect(mrrCalculator.calculateArpu(50000, 10)).toBe(5000)
  })
})

describe('mrrCalculator.sumActiveMrr', () => {
  it('excludes trialing and past_due subscriptions from the sum', () => {
    const total = mrrCalculator.sumActiveMrr([
      { teamId: 't1', planId: 'growth', amountCents: 9900, status: 'active' },
      { teamId: 't2', planId: 'growth', amountCents: 9900, status: 'trialing' },
      { teamId: 't3', planId: 'growth', amountCents: 9900, status: 'past_due' },
    ])
    expect(total).toBe(9900)
  })

  it('returns 0 for empty subscription array', () => {
    expect(mrrCalculator.sumActiveMrr([])).toBe(0)
  })
})
