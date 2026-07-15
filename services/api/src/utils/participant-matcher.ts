export interface TeamUser {
  id: string
  name: string | null
  email?: string | null
}

/**
 * Resolves a raw speaker name/tag to a registered TeamUser using a robust 
 * scoring algorithm that handles partial names, nicknames, and varying structures.
 * 
 * E.g., "Zain" matches "Muhammad Zain Sarwar"
 *       "Uzair" matches "Uzair Sarwar"
 */
export function resolveParticipantToUserId(
  rawName: string | null | undefined,
  teamUsers: TeamUser[]
): string | null {
  if (!rawName || typeof rawName !== 'string') return null

  const searchName = rawName.trim().toLowerCase().replace(/[^\w\s]/g, '')
  if (!searchName) return null

  // 1. Exact Name Match
  const exactMatch = teamUsers.find(u => u.name && u.name.trim().toLowerCase() === searchName)
  if (exactMatch) return exactMatch.id

  // 2. Exact Email Match (if email was passed as a tag)
  const exactEmail = teamUsers.find(u => u.email && u.email.trim().toLowerCase() === searchName)
  if (exactEmail) return exactEmail.id

  // 3. Scoring System for Partial Matches
  const searchParts = searchName.split(/\s+/).filter(p => p.length > 1)
  if (searchParts.length === 0) return null

  let bestMatchId: string | null = null
  let bestScore = 0

  for (const user of teamUsers) {
    if (!user.name) continue

    const cleanName = user.name.trim().toLowerCase().replace(/[^\w\s]/g, '')
    const nameParts = cleanName.split(/\s+/).filter(p => p.length > 1)

    let score = 0

    // Check each part of the search name against the user's real name parts
    for (const sPart of searchParts) {
      if (nameParts.includes(sPart)) {
        score += 10 // Exact word match (e.g. "zain" in ["muhammad", "zain", "sarwar"])
      } else {
        // Substring match for longer words (e.g. "zains" matches "zain")
        if (sPart.length >= 3) {
          for (const nPart of nameParts) {
            if (nPart.includes(sPart) || sPart.includes(nPart)) {
              score += 3
            }
          }
        }
      }
    }

    // Bonus for matching the first part (first name)
    if (searchParts[0] === nameParts[0]) {
      score += 5
    }

    if (score > bestScore) {
      bestScore = score
      bestMatchId = user.id
    }
  }

  // Require a minimum score to avoid random assignments (e.g., matching a single letter)
  // Score of 10 means at least one full >1 letter word matched exactly.
  // Score of 3 means a substring matched. Let's set threshold to 3 so partial names work.
  if (bestScore >= 3) {
    return bestMatchId
  }

  return null
}
