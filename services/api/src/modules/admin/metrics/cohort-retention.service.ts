export interface TeamCohortInput {
  teamId: string
  signupMonth: string // "2026-01"
}

export interface ActivityRecord {
  teamId: string
  activeInMonth: string // teamId was active in this month
}

export interface CohortRow {
  cohortMonth: string
  points: Array<{ periodIndex: number; retainedPct: number }>
}

function monthDiff(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

export const cohortRetentionService = {
  buildCohortMatrix(
    teams: TeamCohortInput[],
    activity: ActivityRecord[],
    monthsToProject = 12
  ): CohortRow[] {
    const activeMonthsByTeam = new Map<string, Set<string>>()
    for (const a of activity) {
      if (!activeMonthsByTeam.has(a.teamId)) activeMonthsByTeam.set(a.teamId, new Set())
      activeMonthsByTeam.get(a.teamId)!.add(a.activeInMonth)
    }

    const cohorts = new Map<string, TeamCohortInput[]>()
    for (const team of teams) {
      if (!cohorts.has(team.signupMonth)) cohorts.set(team.signupMonth, [])
      cohorts.get(team.signupMonth)!.push(team)
    }

    const rows: CohortRow[] = []
    for (const [cohortMonth, cohortTeams] of cohorts) {
      const points = []
      for (let periodIndex = 0; periodIndex <= monthsToProject; periodIndex++) {
        if (cohortTeams.length === 0) {
          points.push({ periodIndex, retainedPct: 0 })
          continue
        }
        const retained = cohortTeams.filter((team) => {
          const activeMonths = activeMonthsByTeam.get(team.teamId)
          if (!activeMonths) return false
          return [...activeMonths].some((m) => monthDiff(cohortMonth, m) === periodIndex)
        }).length
        points.push({ periodIndex, retainedPct: (retained / cohortTeams.length) * 100 })
      }
      rows.push({ cohortMonth, points })
    }
    return rows.sort((a, b) => a.cohortMonth.localeCompare(b.cohortMonth))
  },
}
