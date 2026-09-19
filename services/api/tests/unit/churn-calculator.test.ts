import { churnCalculator } from '../../src/modules/admin/metrics/churn-calculator.service'

describe('churnCalculator.calculateLogoChurnRate', () => {
  it('returns 0 when there were no teams at the start of the period (zero-division guard)', () => {
    expect(churnCalculator.calculateLogoChurnRate(0, 0)).toBe(0)
  })

  it('returns 0 when zero teams churned', () => {
    expect(churnCalculator.calculateLogoChurnRate(100, 0)).toBe(0)
  })

  it('calculates a partial churn rate correctly', () => {
    expect(churnCalculator.calculateLogoChurnRate(100, 5)).toBe(5)
  })

  it('clamps at 100 for a full-churn edge case', () => {
    expect(churnCalculator.calculateLogoChurnRate(10, 10)).toBe(100)
  })

  it('clamps at 100 when churned exceeds start teams', () => {
    expect(churnCalculator.calculateLogoChurnRate(10, 15)).toBe(100)
  })
})

describe('churnCalculator.calculateRevenueChurnRate', () => {
  it('returns 0 when starting MRR was 0 (zero-division guard)', () => {
    expect(churnCalculator.calculateRevenueChurnRate(0, 0)).toBe(0)
  })

  it('calculates a partial revenue churn rate correctly', () => {
    expect(churnCalculator.calculateRevenueChurnRate(100000, 5000)).toBe(5)
  })

  it('clamps at 100 when churned revenue exceeds starting MRR', () => {
    expect(churnCalculator.calculateRevenueChurnRate(10000, 15000)).toBe(100)
  })
})
