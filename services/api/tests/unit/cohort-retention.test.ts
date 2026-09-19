import { cohortRetentionService } from '../../src/modules/admin/metrics/cohort-retention.service'

describe('cohortRetentionService.buildCohortMatrix', () => {
  it('builds a retention matrix correctly across months', () => {
    const teams = [
      { teamId: 't1', signupMonth: '2026-01' },
      { teamId: 't2', signupMonth: '2026-01' },
      { teamId: 't3', signupMonth: '2026-02' },
    ]

    const activity = [
      { teamId: 't1', activeInMonth: '2026-01' },
      { teamId: 't2', activeInMonth: '2026-01' },
      { teamId: 't1', activeInMonth: '2026-02' }, // t2 churned in month 1
      { teamId: 't3', activeInMonth: '2026-02' },
    ]

    const matrix = cohortRetentionService.buildCohortMatrix(teams, activity, 2)

    expect(matrix).toHaveLength(2)
    // 2026-01 cohort
    expect(matrix[0].cohortMonth).toBe('2026-01')
    expect(matrix[0].points[0].periodIndex).toBe(0)
    expect(matrix[0].points[0].retainedPct).toBe(100) // 2/2
    expect(matrix[0].points[1].periodIndex).toBe(1)
    expect(matrix[0].points[1].retainedPct).toBe(50) // 1/2
    expect(matrix[0].points[2].periodIndex).toBe(2)
    expect(matrix[0].points[2].retainedPct).toBe(0)

    // 2026-02 cohort
    expect(matrix[1].cohortMonth).toBe('2026-02')
    expect(matrix[1].points[0].retainedPct).toBe(100) // 1/1
  })

  it('handles empty inputs without throwing', () => {
    const matrix = cohortRetentionService.buildCohortMatrix([], [])
    expect(matrix).toEqual([])
  })
})
