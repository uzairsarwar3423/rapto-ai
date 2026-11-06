/**
 * chatTurnMachine.ts
 * ──────────────────
 * Pure reducer for ONE question→answer turn (plan §4.4/§4.5). No timers, no fetch, no React: every input — including
 * timestamps — arrives in the action, so the machine is trivially testable and can be replayed from golden transcripts.
 *
 *   idle ─send→ sending ─meta→ streaming ─done(stop|no_results|length|filtered)→ complete
 *                 │  │             ├─done(cancelled) | stop→ stopped
 *                 │  └─rejected→ rejected (pre-stream HTTP error; no assistant placeholder)
 *                 └─fail / error / watchdog / protocol→ failed
 *
 * Rules:
 *  - Events that cannot apply in the current phase return the SAME state object (the manager logs the anomaly by
 *    reference-comparing). An invalid transition is an anomaly, never a crash.
 *  - Nothing happens after a terminal phase except a fresh `send` (retry reuses the clientMessageId).
 *  - `finalizing` from the plan table is not a reducer state: flushing the token buffer happens *before* the `done`
 *    action is reduced (streamManager guarantees the ordering), so the reducer goes straight to a terminal phase.
 */

import type { ChatEvent, ChatFilters, FinishReason, Quota, SourceItem, Stage } from "@/lib/contracts/chat";

export type TurnPhase = "idle" | "sending" | "streaming" | "complete" | "stopped" | "failed" | "rejected";

export type TurnErrorKind =
  | "stream" //     in-stream `error` event
  | "http" //       pre-stream HTTP status (see `status`)
  | "network" //    fetch rejected / connection dropped
  | "watchdog" //   no bytes for 35 s
  | "protocol" //   undecodable / invalid frame
  | "version" //    server speaks a newer protocol
  | "local"; //     refused locally (concurrency guards)

export interface TurnError {
  kind: TurnErrorKind;
  /** Stream error code, BFF/HTTP error code, or a local code. */
  code: string;
  message: string;
  retryable: boolean;
  status?: number;
  retryAfterS?: number;
  resetsAt?: string;
  requestId?: string;
  field?: string;
  reason?: string;
}

export interface ActivityStep {
  stage: Stage | "unknown";
  /** Client-measured arrival time (ms epoch). */
  at: number;
  detail?: Record<string, unknown> | null;
}

export interface TurnCitations {
  valid: string[];
  removed: string[];
  grounded: boolean;
  flags: string[];
}

export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
  quotaRemaining: number | null;
  quota: Quota | null;
}

export interface TurnState {
  phase: TurnPhase;
  clientMessageId: string;
  userText: string;
  filters: ChatFilters;
  sessionId: string | null;
  messageId: string | null;
  requestId: string | null;
  replayed: boolean;
  stage: Stage | "unknown" | null;
  stageDetail: Record<string, unknown> | null;
  steps: ActivityStep[];
  text: string;
  sources: SourceItem[];
  citations: TurnCitations | null;
  usage: TurnUsage | null;
  finishReason: FinishReason | null;
  error: TurnError | null;
  /** True when the user (or the cancel path) ended the turn. */
  stoppedByUser: boolean;
  startedAt: number | null;
  firstEventAt: number | null;
  firstTokenAt: number | null;
  doneAt: number | null;
}

export type TurnAction =
  | { type: "send"; clientMessageId: string; text: string; filters: ChatFilters; sessionId: string | null; at: number }
  | { type: "rejected"; error: TurnError; at: number }
  | { type: "event"; event: ChatEvent; at: number }
  /** A flushed batch of token text (the stream manager coalesces tokens per animation frame). */
  | { type: "tokens"; text: string; at: number }
  | { type: "stop"; at: number }
  | { type: "fail"; error: TurnError; at: number };

export const EMPTY_FILTERS: ChatFilters = { meeting_ids: [], speaker_ids: [] };

export function initialTurn(): TurnState {
  return {
    phase: "idle",
    clientMessageId: "",
    userText: "",
    filters: EMPTY_FILTERS,
    sessionId: null,
    messageId: null,
    requestId: null,
    replayed: false,
    stage: null,
    stageDetail: null,
    steps: [],
    text: "",
    sources: [],
    citations: null,
    usage: null,
    finishReason: null,
    error: null,
    stoppedByUser: false,
    startedAt: null,
    firstEventAt: null,
    firstTokenAt: null,
    doneAt: null,
  };
}

export const isActive = (s: Pick<TurnState, "phase">): boolean => s.phase === "sending" || s.phase === "streaming";
export const isTerminal = (s: Pick<TurnState, "phase">): boolean =>
  s.phase === "complete" || s.phase === "stopped" || s.phase === "failed" || s.phase === "rejected";

export function chatTurnReducer(state: TurnState, action: TurnAction): TurnState {
  switch (action.type) {
    case "send":
      // A new send is legal from any non-active phase (retry included). Sending while active is refused upstream.
      if (isActive(state)) return state;
      return {
        ...initialTurn(),
        phase: "sending",
        clientMessageId: action.clientMessageId,
        userText: action.text,
        filters: action.filters,
        sessionId: action.sessionId,
        startedAt: action.at,
      };

    case "rejected":
      if (state.phase !== "sending") return state;
      return { ...state, phase: "rejected", error: action.error, doneAt: action.at };

    case "stop":
      if (!isActive(state)) return state;
      return { ...state, phase: "stopped", stoppedByUser: true, finishReason: state.finishReason ?? "cancelled", doneAt: action.at };

    case "fail":
      if (!isActive(state)) return state;
      return { ...state, phase: "failed", error: action.error, doneAt: action.at };

    case "tokens":
      if (state.phase !== "streaming" || action.text === "") return state;
      return {
        ...state,
        text: state.text + action.text,
        firstTokenAt: state.firstTokenAt ?? action.at,
        // Once text flows the "answering" stage is implied even if the server omitted that status event.
        stage: state.stage === "answering" ? state.stage : "answering",
      };

    case "event":
      return reduceEvent(state, action.event, action.at);
  }
}

function reduceEvent(state: TurnState, ev: ChatEvent, at: number): TurnState {
  if (state.phase === "sending") {
    // The protocol guarantees `meta` first. Anything else before it is ignored (and logged by the manager).
    if (ev.type !== "meta") return state;
    return {
      ...state,
      phase: "streaming",
      requestId: ev.request_id,
      sessionId: ev.session_id,
      messageId: ev.message_id,
      replayed: ev.replayed,
      firstEventAt: at,
    };
  }
  if (state.phase !== "streaming") return state;

  switch (ev.type) {
    case "meta":
      return state; // duplicate meta: anomaly

    case "status": {
      const last = state.steps[state.steps.length - 1];
      const steps =
        last && last.stage === ev.stage
          ? [...state.steps.slice(0, -1), { ...last, detail: ev.detail ?? last.detail }]
          : [...state.steps, { stage: ev.stage, at, detail: ev.detail ?? null }];
      return { ...state, stage: ev.stage, stageDetail: ev.detail ?? state.stageDetail, steps };
    }

    case "sources":
      return { ...state, sources: ev.sources };

    case "token":
      return {
        ...state,
        text: state.text + ev.t,
        firstTokenAt: state.firstTokenAt ?? at,
        stage: state.stage === "answering" ? state.stage : "answering",
      };

    case "citations":
      return { ...state, citations: { valid: ev.valid, removed: ev.removed, grounded: ev.grounded, flags: ev.flags } };

    case "usage":
      return {
        ...state,
        usage: {
          inputTokens: ev.input_tokens,
          outputTokens: ev.output_tokens,
          quotaRemaining: ev.quota?.remaining ?? ev.quota_remaining ?? null,
          quota: ev.quota ?? null,
        },
      };

    case "done":
      return {
        ...state,
        phase: ev.finish_reason === "cancelled" ? "stopped" : "complete",
        finishReason: ev.finish_reason,
        stage: null,
        doneAt: at,
      };

    case "error":
      return {
        ...state,
        phase: "failed",
        stage: null,
        doneAt: at,
        error: {
          kind: "stream",
          code: ev.code,
          message: ev.message,
          retryable: ev.code === "CONTENT_FILTERED" ? false : ev.retryable,
          requestId: state.requestId ?? undefined,
        },
      };
  }
}

// ─── Derived view helpers (single place that decides which UI a turn gets; §4.5) ────────────────────────────────

export type TurnOutcome =
  | "pending" //       sending / streaming
  | "answer" //        done: stop
  | "no_results" //    done: no_results
  | "truncated" //     done: length
  | "filtered" //      done: filtered | error: CONTENT_FILTERED
  | "stopped" //       user Stop or server `cancelled`
  | "error" //         failed / rejected
  | "idle";

export function deriveOutcome(s: TurnState): TurnOutcome {
  switch (s.phase) {
    case "idle":
      return "idle";
    case "sending":
    case "streaming":
      return "pending";
    case "stopped":
      return "stopped";
    case "failed":
    case "rejected":
      return s.error?.code === "CONTENT_FILTERED" ? "filtered" : "error";
    case "complete":
      switch (s.finishReason) {
        case "no_results":
          return "no_results";
        case "length":
          return "truncated";
        case "filtered":
          return "filtered";
        default:
          return "answer";
      }
  }
}

/** Is a Retry action meaningful for this turn? (Same client_message_id; the backend replays or reruns.) */
export function canRetry(s: TurnState): boolean {
  if (s.phase === "stopped") return true;
  if (s.phase === "failed" || s.phase === "rejected") {
    if (!s.error) return false;
    if (s.error.code === "CONTENT_FILTERED" || s.error.code === "FORBIDDEN" || s.error.code === "FEATURE_DISABLED") return false;
    if (s.error.code === "QUOTA_EXCEEDED") return false;
    return s.error.retryable;
  }
  return false;
}

/** A turn that produced readable text worth keeping on screen even though it did not finish cleanly. */
export function hasPartialText(s: TurnState): boolean {
  return s.text.trim().length > 0 && (s.phase === "failed" || s.phase === "stopped");
}
