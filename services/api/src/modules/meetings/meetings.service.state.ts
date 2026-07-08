// ─────────────────────────────────────────────────────────────────────────────
// meetings.service.state.ts — Meeting State Machine
//
// Pure function — no side effects, no dependencies.
// Imported by both meetings.service.ts and meetings.repository.ts
// for defense-in-depth state machine enforcement.
//
// Why two layers?
//   Service:    First check — business logic layer catches invalid calls early
//   Repository: Second check — DB layer catches rogue callers (e.g., buggy workers)
// ─────────────────────────────────────────────────────────────────────────────

import type { MeetingStatus } from '@prisma/client'
import { AppError } from '../../utils/errors'

// ── Valid Transition Matrix ───────────────────────────────────────────────────
//
//  State machine for the Vocaply meeting AI pipeline lifecycle:
//
//  SCHEDULED                  → BOT_JOINING (webhook: bot.joining_call)
//  SCHEDULED                  → CANCELLED   (user: DELETE /meetings/:id/bot)
//  BOT_JOINING                → RECORDING   (webhook: bot.recording_started)
//  BOT_JOINING                → FAILED      (webhook: bot.failed)
//  BOT_JOINING                → CANCELLED
//  RECORDING                  → PROCESSING  (webhook: bot.done)
//  RECORDING                  → FAILED
//  PROCESSING                 → TRANSCRIBED | TRANSCRIPT_CLEANED | TRANSCRIPT_CLEANUP_FAILED
//  TRANSCRIBED                → TRANSCRIPT_CLEANED | TRANSCRIPT_CLEANUP_FAILED
//  TRANSCRIPT_CLEANED         → EXTRACTED | EXTRACTED_PARTIAL | EXTRACTION_FAILED
//  TRANSCRIPT_CLEANUP_FAILED  → EXTRACTED | EXTRACTED_PARTIAL | EXTRACTION_FAILED   (degraded mode)
//  TRANSCRIPT_CLEANUP_DEGRADED→ EXTRACTED | EXTRACTED_PARTIAL | EXTRACTION_FAILED   (raw transcript used)
//  EXTRACTED                  → RESOLVED | RESOLUTION_FAILED
//  EXTRACTED_PARTIAL          → RESOLVED | RESOLUTION_FAILED
//  EXTRACTION_FAILED          → FAILED     TERMINAL
//  RESOLVED                   → DONE       TERMINAL
//  RESOLUTION_FAILED          → FAILED     TERMINAL (or re-queued by admin)
//  DONE                       → (none)     TERMINAL
//  FAILED                     → (none)     TERMINAL
//  CANCELLED                  → (none)     TERMINAL

const VALID_TRANSITIONS: Readonly<Record<MeetingStatus, MeetingStatus[]>> = {
  SCHEDULED: ['BOT_JOINING', 'RECORDING', 'PROCESSING', 'FAILED', 'CANCELLED'],
  BOT_JOINING: ['RECORDING', 'PROCESSING', 'FAILED', 'CANCELLED'],
  RECORDING: ['PROCESSING', 'FAILED'],
  PROCESSING: ['TRANSCRIBED', 'TRANSCRIPT_CLEANED', 'TRANSCRIPT_CLEANUP_FAILED', 'TRANSCRIPT_CLEANUP_DEGRADED', 'DONE', 'FAILED'],
  TRANSCRIBED: ['TRANSCRIPT_CLEANED', 'TRANSCRIPT_CLEANUP_FAILED', 'TRANSCRIPT_CLEANUP_DEGRADED', 'FAILED'],
  // Cleanup succeeded — AI transcript available
  TRANSCRIPT_CLEANED: ['EXTRACTED', 'EXTRACTED_PARTIAL', 'EXTRACTION_FAILED', 'FAILED'],
  // Cleanup failed — falling back to raw transcript for extraction
  TRANSCRIPT_CLEANUP_FAILED: ['EXTRACTED', 'EXTRACTED_PARTIAL', 'EXTRACTION_FAILED', 'FAILED'],
  // Explicit degraded mode — transcribe.worker chose raw transcript after cleanup failure
  TRANSCRIPT_CLEANUP_DEGRADED: ['EXTRACTED', 'EXTRACTED_PARTIAL', 'EXTRACTION_FAILED', 'FAILED'],
  EXTRACTED: ['RESOLVED', 'RESOLUTION_FAILED', 'FAILED'],
  EXTRACTED_PARTIAL: ['RESOLVED', 'RESOLUTION_FAILED', 'FAILED'],
  EXTRACTION_FAILED: ['FAILED'],
  RESOLVED: ['DONE'],
  // Resolution failed after all retries — meeting data is present, just resolution state unknown
  RESOLUTION_FAILED: ['FAILED'],
  DONE: [],
  FAILED: [],
  CANCELLED: [],
} as const

// ── Terminal States ───────────────────────────────────────────────────────────

export const TERMINAL_STATES = new Set<MeetingStatus>([
  'DONE',
  'FAILED',
  'CANCELLED',
  'EXTRACTION_FAILED',
  'RESOLVED',
  'RESOLUTION_FAILED',  // Resolution exhausted all retries — manual admin action required
])

// ── In-Flight States ──────────────────────────────────────────────────────────

export const IN_FLIGHT_STATUSES: MeetingStatus[] = [
  'SCHEDULED',
  'BOT_JOINING',
  'RECORDING',
  'PROCESSING',
  'TRANSCRIBED',
  'TRANSCRIPT_CLEANED',
  'TRANSCRIPT_CLEANUP_FAILED',
  'TRANSCRIPT_CLEANUP_DEGRADED',
  'EXTRACTED',
  'EXTRACTED_PARTIAL',
]

// ── State Machine Validator ───────────────────────────────────────────────────

/**
 * Validate that a state transition is permitted.
 * Throws AppError(INVALID_STATUS_TRANSITION, 409) if invalid.
 *
 * Called in:
 *   1. meetings.service.ts — before any business logic executes
 *   2. meetings.repository.updateStatus() — defense in depth
 *
 * Duplicate webhook handling:
 *   Recall.ai retries webhooks on failure. A duplicate webhook (e.g., second
 *   bot.recording_started when already in RECORDING) will hit this check and
 *   throw a typed error — the webhook handler should treat this as a no-op.
 */
export function validateTransition(from: MeetingStatus, to: MeetingStatus): void {
  const allowed = VALID_TRANSITIONS[from]

  if (!allowed || !allowed.includes(to)) {
    throw new AppError(
      'INVALID_STATUS_TRANSITION',
      409,
      `Cannot transition meeting from ${from} to ${to}. Allowed transitions from ${from}: [${allowed?.join(', ') || 'none — terminal state'}]`,
      { from, to, allowed: allowed ?? [] }
    )
  }
}

/**
 * Check if a state is a terminal state.
 * Terminal states cannot be transitioned to any other state.
 */
export function isTerminalState(status: MeetingStatus): boolean {
  return TERMINAL_STATES.has(status)
}

/**
 * Get all allowed next states for a given status.
 * Useful for building admin UI state transition options.
 */
export function getAllowedTransitions(from: MeetingStatus): MeetingStatus[] {
  return VALID_TRANSITIONS[from] ?? []
}
