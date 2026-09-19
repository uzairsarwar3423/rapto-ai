export const churnCalculator = {
  calculateLogoChurnRate(teamsAtStart: number, teamsChurned: number): number {
    if (teamsAtStart === 0) return 0
    return Math.min(100, Math.max(0, (teamsChurned / teamsAtStart) * 100))
  },

  calculateRevenueChurnRate(mrrAtStartCents: number, churnedMrrCents: number): number {
    if (mrrAtStartCents === 0) return 0
    return Math.min(100, Math.max(0, (churnedMrrCents / mrrAtStartCents) * 100))
  },
}
