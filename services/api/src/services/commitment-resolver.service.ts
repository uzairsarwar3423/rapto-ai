import { prisma } from '../db/client'
import { logger } from '../config/logger'

const STOPWORDS = new Set([
  'i', 'will', 'have', 'the', 'a', 'an', 'by', 'to', 'it', 'my',
  'is', 'am', 'are', 'be', 'was', 'were', 'been', 'do', 'did',
  'does', 'for', 'with', 'this', 'that', 'all', 'in', 'on', 'at',
  'up', 'we', 'our', "i'll", "i'm", "let", "me", "make", "sure"
])

const COMPLETION_KEYWORDS = [
  'done', 'finished', 'completed', 'merged', 'deployed', 'shipped',
  'sent', 'delivered', 'fixed', 'resolved', 'pushed', 'released',
  'launched', 'submitted', 'closed', 'published', 'live', 'went live'
]

const NON_COMPLETION_PHRASES = [
  'still working', 'in progress', 'not done yet', 'almost', 'partially',
  'working on', 'in review', 'pending', 'blocked', 'waiting',
  'havent finished', "haven't finished", 'not finished', 'not completed'
]

const SIMILARITY_THRESHOLD = 0.65

export interface ExtractedCommitment {
  text: string
  owner_name: string
  due_date_raw: string | null
  confidence: number
}

/**
 * Normalizes text for similarity comparison (lowercase, strip punctuation, remove stopwords, limit tokens)
 */
export function normalizeText(text: string): string {
  let normalized = text.toLowerCase()
  normalized = normalized.replace(/[^\w\s]/g, '')
  
  let tokens = normalized.split(/\s+/)
  tokens = tokens.filter(t => !STOPWORDS.has(t))
  
  // Very simple stemming
  const stemmed = tokens.map(token => {
    if (token.endsWith('ing') && token.length > 5) return token.slice(0, -3)
    if (token.endsWith('ed') && token.length > 4) return token.slice(0, -2)
    if (token.endsWith('s') && token.length > 3) return token.slice(0, -1)
    return token
  })

  return stemmed.slice(0, 5).join(' ')
}

/**
 * Jaccard similarity fallback (Keyword overlap ratio)
 */
function keywordOverlapRatio(text1: string, text2: string): number {
  const tokens1 = new Set(normalizeText(text1).split(' '))
  const tokens2 = new Set(normalizeText(text2).split(' '))

  if (tokens1.size === 0 || tokens2.size === 0) return 0

  let intersectionSize = 0
  tokens1.forEach(t => {
    if (tokens2.has(t)) intersectionSize++
  })

  const unionSize = new Set([...tokens1, ...tokens2]).size
  return intersectionSize / unionSize
}

/**
 * Basic Similarity Score (In a pure Node env without sklearn, we rely heavily on keyword overlap. 
 * A more robust implementation would use a native TF-IDF library or an external microservice)
 */
export function calculateSimilarityScore(text1: string, text2: string): number {
  return keywordOverlapRatio(text1, text2)
}

/**
 * Calculates the Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = Array(b.length + 1).fill(0).map(() => Array(a.length + 1).fill(0));

  for (let i = 0; i <= b.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const indicator = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + indicator // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Jaccard Similarity (Word Intersection) for names.
 * Handles cases like "Muhammad Uzair" vs "Uzair Sarwar" where one significant word matches.
 */
export function wordIntersectionSimilarity(name1: string, name2: string): number {
  const words1 = new Set(name1.toLowerCase().trim().split(/\s+/));
  const words2 = new Set(name2.toLowerCase().trim().split(/\s+/));

  if (words1.size === 0 || words2.size === 0) return 0;

  let intersectionCount = 0;
  for (const w of words1) {
    if (words2.has(w)) intersectionCount++;
  }

  // If there's an exact word match and it's a significant word (length > 2)
  if (intersectionCount > 0) {
    for (const w of words1) {
      if (words2.has(w) && w.length > 2) {
        return 0.85; // High confidence if a substantial name part matches completely
      }
    }
  }

  const unionCount = new Set([...words1, ...words2]).size;
  return intersectionCount / unionCount;
}

/**
 * Calculates a name similarity score between 0 and 1.
 * Combines Jaccard Word Intersection and Levenshtein distance for maximum resilience.
 */
export function nameSimilarity(name1: string, name2: string): number {
  const n1 = name1.toLowerCase().trim();
  const n2 = name2.toLowerCase().trim();
  
  if (n1 === n2) return 1.0;
  
  // 1. Check Word Intersection (Jaccard) first for swapped/added names
  const jaccardScore = wordIntersectionSimilarity(n1, n2);
  if (jaccardScore >= 0.85) return jaccardScore;
  
  // 2. Fallback to Levenshtein distance for minor spelling mistakes (e.g., "Ahmad" vs "Ahmed")
  const dist = levenshteinDistance(n1, n2);
  const maxLength = Math.max(n1.length, n2.length);
  const levenshteinScore = (maxLength - dist) / maxLength;
  
  return Math.max(jaccardScore, levenshteinScore);
}

// ============================================================================
// IDENTITY RESOLUTION ENGINE (3-TIER ARCHITECTURE)
// ============================================================================

export interface MeetingParticipant {
  userId?: string;     // Known platform user ID (if matched via email/provider sync)
  email?: string;      // Email from calendar invite / Zoom
  displayName: string; // The raw name shown in the meeting transcript
}

export interface PlatformUser {
  id: string;
  name: string;
  email?: string;
  aliases: string[];   // Important: Requires `aliases String[]` in Prisma User schema
}

export interface IdentityResolutionResult {
  userId: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'UNMAPPED';
  reason: string;
}

export class IdentityResolutionService {
  /**
   * Resolves an extracted name to a Platform User using the 3-Tier Architecture.
   */
  static resolveIdentity(
    extractedName: string,
    meetingParticipants: MeetingParticipant[],
    platformUsers: PlatformUser[]
  ): IdentityResolutionResult {
    const extractedClean = extractedName.toLowerCase().trim();

    // ---------------------------------------------------------
    // TIER 1: Participant Identity Mapping (Email / Provider ID)
    // ---------------------------------------------------------
    // Check if a participant with this display name was explicitly synced (via email)
    const exactParticipant = meetingParticipants.find(p => p.displayName.toLowerCase().trim() === extractedClean);
    if (exactParticipant && exactParticipant.userId) {
      return {
        userId: exactParticipant.userId,
        confidence: 'HIGH',
        reason: 'Tier 1: Exact meeting participant match with known User ID (via Email/Sync)'
      };
    }

    // ---------------------------------------------------------
    // TIER 2A: Exact Name or Alias Match in Database
    // ---------------------------------------------------------
    for (const user of platformUsers) {
      if (user.name.toLowerCase().trim() === extractedClean) {
        return { userId: user.id, confidence: 'HIGH', reason: 'Tier 2A: Exact primary name match' };
      }
      if (user.aliases && user.aliases.some(a => a.toLowerCase().trim() === extractedClean)) {
        return { userId: user.id, confidence: 'HIGH', reason: 'Tier 2A: Exact alias match' };
      }
    }

    // ---------------------------------------------------------
    // TIER 2B: Word-Level Fuzzy Matching + Levenshtein
    // ---------------------------------------------------------
    let bestMatchUser: PlatformUser | null = null;
    let highestSim = 0;

    for (const user of platformUsers) {
      let sim = nameSimilarity(user.name, extractedName);
      
      if (user.aliases) {
        for (const alias of user.aliases) {
          const aliasSim = nameSimilarity(alias, extractedName);
          if (aliasSim > sim) sim = aliasSim;
        }
      }

      if (sim > highestSim) {
        highestSim = sim;
        bestMatchUser = user;
      }
    }

    // If similarity is >= 0.85, we safely assign it (Handles Typos & swapped names)
    if (bestMatchUser && highestSim >= 0.85) {
      return { 
        userId: bestMatchUser.id, 
        confidence: 'MEDIUM', 
        reason: `Tier 2B: Fuzzy match (score: ${highestSim.toFixed(2)})` 
      };
    }

    // ---------------------------------------------------------
    // TIER 3: Unmapped / Requires Human-in-the-loop
    // ---------------------------------------------------------
    return {
      userId: null,
      confidence: 'UNMAPPED',
      reason: 'Tier 3: Name could not be resolved confidently. Requires human assignment via UI.'
    };
  }

  /**
   * TIER 3 ACTION: The Self-Healing Feedback Loop (Human-in-the-Loop)
   * 
   * When a user manually assigns an "Unmapped" action item to a user via the frontend UI,
   * your API controller should call this function. It saves the misspelled or alternative 
   * name as an alias so the AI never misses it again.
   */
  static async trainSystemWithAlias(userId: string, unmappedName: string) {
    const cleanAlias = unmappedName.trim();
    if (!cleanAlias) return;

    try {
      // NOTE: This assumes your Prisma User model has `aliases String[]` or JSON field
      // Adjust the `any` casting below depending on your actual Prisma Schema typing
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { aliases: true } as any
      });

      if (!user) throw new Error("User not found for alias training");

      const aliases = Array.isArray((user as any).aliases) ? (user as any).aliases : [];
      
      if (!aliases.includes(cleanAlias)) {
        aliases.push(cleanAlias);
        await prisma.user.update({
          where: { id: userId },
          data: { aliases } as any
        });
        logger.info({ userId, newAlias: cleanAlias }, "Identity System self-healed: Trained with new alias");
      }
    } catch (error) {
      logger.error({ userId, unmappedName, error }, "Failed to train system with new alias");
    }
  }
}

/**
 * Main cross-meeting resolver. Maps new extraction results against historical open commitments.
 */
export async function resolveCommitments(
  teamId: string,
  meetingId: string,
  newExtractions: ExtractedCommitment[],
  historicalCommitments: { id: string, text: string, owner: { name: string, email?: string, aliases?: string[] } }[]
) {
  const created: ExtractedCommitment[] = []
  const resolved: { historicalId: string, newStatus: 'FULFILLED', resolvedInMeetingId: string }[] = []
  const referenced: string[] = []
  const matchedHistoricalIds = new Set<string>()

  // Deduplicate historical owners by name for matching (preserving aliases)
  const uniqueHistoricalOwners = Array.from(
    new Map(historicalCommitments.map(h => [h.owner.name, h.owner])).values()
  );

  for (const extracted of newExtractions) {
    let resolvedOwnerName = extracted.owner_name;
    let bestNameSim = 0;
    
    // Fuzzy match the extracted owner name against known historical owners and their aliases
    for (const histOwner of uniqueHistoricalOwners) {
      // 1. Direct name similarity
      let sim = nameSimilarity(histOwner.name, extracted.owner_name);
      
      // 2. Alias similarity (if available)
      if (histOwner.aliases && histOwner.aliases.length > 0) {
        for (const alias of histOwner.aliases) {
          const aliasSim = nameSimilarity(alias, extracted.owner_name);
          if (aliasSim > sim) sim = aliasSim;
        }
      }

      if (sim > bestNameSim) {
        bestNameSim = sim;
        resolvedOwnerName = histOwner.name;
      }
    }
    
    // If similarity is above 0.75, we assume it's the same person (handles typos and distinct aliases)
    const finalOwnerName = bestNameSim >= 0.75 ? resolvedOwnerName : extracted.owner_name;

    const ownerHistory = historicalCommitments.filter(
      h => h.owner.name === finalOwnerName || h.owner.name.toLowerCase() === extracted.owner_name.toLowerCase()
    )

    let bestScore = SIMILARITY_THRESHOLD
    let bestMatch = null

    for (const historical of ownerHistory) {
      let score = calculateSimilarityScore(extracted.text, historical.text)
      
      const normExt = normalizeText(extracted.text)
      const normHist = normalizeText(historical.text)
      
      // Boost if prefix matches heavily
      if (normExt && normHist && normExt.slice(0, 10) === normHist.slice(0, 10)) {
        score = Math.min(score + 0.1, 1.0)
      }

      if (score > bestScore) {
        bestScore = score
        bestMatch = historical
      }
    }

    if (!bestMatch) {
      created.push(extracted)
    } else {
      matchedHistoricalIds.add(bestMatch.id)
      
      // Resolution detection
      const lowerText = extracted.text.toLowerCase()
      const hasNonCompletion = NON_COMPLETION_PHRASES.some(phrase => lowerText.includes(phrase))
      const hasCompletionKeyword = COMPLETION_KEYWORDS.some(kw => lowerText.includes(kw))

      if (!hasNonCompletion && hasCompletionKeyword) {
        // Ideally we would run a fast binary LLM check here via `claudeClient`. 
        // We'll approximate for now based on keywords.
        resolved.push({
          historicalId: bestMatch.id,
          newStatus: 'FULFILLED',
          resolvedInMeetingId: meetingId
        })
      } else {
        referenced.push(bestMatch.id)
      }
    }
  }

  const unchanged = historicalCommitments.filter(h => !matchedHistoricalIds.has(h.id))

  return { created, resolved, referenced, unchanged }
}
