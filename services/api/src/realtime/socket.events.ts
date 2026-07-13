// ─────────────────────────────────────────────────────────────────────────────
// socket.events.ts — Canonical Event Name Registry
//
// SINGLE SOURCE OF TRUTH for every Socket.io event name used in the backend.
// The frontend uses the EXACT same string values.
//
// RULE: Every emit() call anywhere in the codebase MUST import from this file.
// Inline string literals like io.emit('commitment:fulfilled') are a code-review
// rejection.
// ─────────────────────────────────────────────────────────────────────────────

// ── Events the CLIENT sends to the SERVER ────────────────────────────────────

export const CLIENT_EVENTS = {
  JOIN_TEAM:     'join:team',
  LEAVE_TEAM:    'leave:team',
  JOIN_MEETING:  'join:meeting',
  LEAVE_MEETING: 'leave:meeting',
  PRESENCE_PING: 'presence:ping',
} as const

// ── Events the SERVER sends to the CLIENT ────────────────────────────────────

export const SERVER_EVENTS = {
  // ── Meeting lifecycle (AI pipeline driven) ──────────────────────────────
  MEETING_BOT_JOINING:      'meeting:bot_joining',
  MEETING_RECORDING:        'meeting:recording',
  MEETING_PROCESSING:       'meeting:processing',

  // Emitted by transcribe.worker after /transcripts/cleanup succeeds
  MEETING_TRANSCRIPT_CLEANED: 'meeting:transcript_cleaned',
  // Emitted by transcribe.worker in degraded mode (cleanup failed, raw used)
  MEETING_TRANSCRIPT_CLEANUP_DEGRADED: 'meeting:transcript_cleanup_degraded',

  // Emitted by extract.worker after /extract succeeds (all chunks)
  MEETING_EXTRACTED:        'meeting:extracted',
  // Emitted by extract.worker when /extract returns HTTP 206 (partial success)
  MEETING_EXTRACTED_PARTIAL: 'meeting:extracted_partial',

  // Emitted by extract.worker (legacy name — kept for backward compat)
  MEETING_PROCESSED:        'meeting:processed',

  // Emitted by resolve.worker after /resolve succeeds
  MEETING_RESOLVED:         'meeting:resolved',
  // Emitted by resolve.worker when /resolve returns HTTP 206
  MEETING_RESOLVED_PARTIAL: 'meeting:resolved_partial',

  MEETING_FAILED:           'meeting:failed',
  TRANSCRIPT_TURN:          'transcript:turn',

  // ── Commitments ─────────────────────────────────────────────────────────
  COMMITMENT_CREATED:    'commitment:created',
  /**
   * Emitted per FULFILLED commitment by resolve.worker → routes to the
   * commitment owner's user room (user:{ownerId}) — triggers in-app notification.
   */
  COMMITMENT_FULFILLED:  'commitment:fulfilled',
  COMMITMENT_MISSED:     'commitment:missed',
  COMMITMENT_DEFERRED:   'commitment:deferred',

  // ── Personal / deadline ──────────────────────────────────────────────────
  MY_DEADLINE_TODAY:   'my:deadline_today',
  MY_DEADLINE_MISSED:  'my:deadline_missed',
  MY_SCORE_UPDATED:    'my:score_updated',

  // ── Team members ─────────────────────────────────────────────────────────
  MEMBER_SCORE_UPDATED: 'member:score_updated',
  MEMBER_JOINED:        'member:joined',
  MEMBER_REMOVED:       'member:removed',

  // ── System ───────────────────────────────────────────────────────────────
  SYSTEM_SESSION_EXPIRED: 'system:session_expired',
  SYSTEM_PLAN_LIMIT:      'system:plan_limit',

  // ── Integrations ─────────────────────────────────────────────────────────
  INTEGRATION_CONNECTED:    'integration:connected',
  INTEGRATION_DISCONNECTED: 'integration:disconnected',
  ACTION_ITEM_SYNCED:       'action_item:synced',
  // Day 59: fired when a Jira webhook marks an action item complete.
  // Payload: { actionItemId, completed, source: 'jira' }
  // Frontend reads `source` to decide whether to render the "Synced from Jira" badge.
  ACTION_ITEM_COMPLETED:    'action_item:completed',

  // ── Notifications ────────────────────────────────────────────────────────
  NOTIFICATION_CREATED: 'notification:created',
  NOTIFICATION_READ:    'notification:read',
} as const

export type ClientEvent = typeof CLIENT_EVENTS[keyof typeof CLIENT_EVENTS]
export type ServerEvent = typeof SERVER_EVENTS[keyof typeof SERVER_EVENTS]
