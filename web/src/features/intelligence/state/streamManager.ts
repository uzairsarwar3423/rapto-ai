/**
 * streamManager.ts
 * ────────────────
 * App-level owner of in-flight chat turns (ADR-3). It lives OUTSIDE React so a stream survives navigation and session
 * switches (D-6); components only subscribe to its zustand store.
 *
 * Invariants (each has a test in tests/unit/streamManager.test.ts):
 *  1. Tokens are batched to one store update per animation frame — but the buffer is ALWAYS flushed before any
 *     non-token event is reduced, so `done` can never overtake buffered text (no truncated final message).
 *  2. Hidden tabs: rAF stops, so a timer fallback and a `visibilitychange` flush keep text from being stranded.
 *  3. Replayed answers (idempotent retry) bypass batching: the stored text appears at once, no typing effect.
 *  4. At most 2 active streams overall, 1 per session — refused locally with the same codes the server would use.
 *  5. Stop / logout / team switch / page unload abort the controller; the AbortError path never reports a failure.
 *  6. On `complete` the turn is written into the React Query cache (messages are NOT duplicated in a second store) and
 *     then reconciled with the server copy. Stopped / failed / rejected turns stay visible with Retry until the user
 *     sends again or dismisses them.
 */

import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { useAuthStore } from "@/features/auth/store/auth.store";
import {
  CHAT_LIMITS, type ChatErrorInfo, type ChatEvent, type ChatFilters, type ChatMessageRecord, type ChatRequest, type ChatSession,
  type MessageList, type SessionList,
} from "@/lib/contracts/chat";
import { ChatRequestError, ChatStreamError, streamChatQuery, type ChatClientDeps } from "../api/chatClient";
import { defaultChatDeps } from "../api/chatDeps";
import { chatTelemetry } from "../telemetry/chatTelemetry";
import { checkMessage } from "../utils/inputLimits";
import { chatKeys, chatScopeOf, getChatScope } from "./chatKeys";
import { useChatQuota, quotaLevel } from "./chatQuotaStore";
import {
  chatTurnReducer, EMPTY_FILTERS, initialTurn, isActive, isTerminal, type TurnAction, type TurnError, type TurnState,
} from "./chatTurnMachine";

// ─── Store ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface StreamEntry {
  turn: TurnState;
  scope: string;
  /** Retained so Retry resends exactly the same request (same client_message_id). */
  request: ChatRequest;
  /** True once the finished turn has been written into the query cache. */
  committed: boolean;
  retries: number;
}

interface StreamsState {
  streams: Record<string, StreamEntry>;
}
export const useChatStreams = create<StreamsState>(() => ({ streams: {} }));

const get = (id: string): StreamEntry | undefined => useChatStreams.getState().streams[id];
const put = (id: string, entry: StreamEntry): void => useChatStreams.setState((s) => ({ streams: { ...s.streams, [id]: entry } }));
const drop = (id: string): void =>
  useChatStreams.setState((s) => {
    if (!(id in s.streams)) return s;
    const next = { ...s.streams };
    delete next[id];
    return { streams: next };
  });

// ─── Runtime configuration (injectable for tests) ──────────────────────────────────────────────────────────────

export interface ManagerConfig {
  queryClient: QueryClient | null;
  stream: typeof streamChatQuery;
  deps: () => ChatClientDeps;
  now: () => number;
  /** Request a flush callback. Default: next animation frame, with a timer fallback for hidden tabs. */
  schedule: (cb: () => void) => void;
  scope: () => string | null;
}

function defaultSchedule(cb: () => void): void {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    cb();
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
  setTimeout(run, 100); // rAF is paused in background tabs; timers still fire (throttled), so text is never stranded
}

const config: ManagerConfig = {
  queryClient: null,
  stream: streamChatQuery,
  deps: defaultChatDeps,
  now: () => Date.now(),
  schedule: defaultSchedule,
  scope: getChatScope,
};

/** Called once by the chat page with the app's QueryClient (and by tests with doubles). */
export function configureStreamManager(patch: Partial<ManagerConfig>): void {
  Object.assign(config, patch);
}

// ─── Per-stream runtime (not React state) ──────────────────────────────────────────────────────────────────────

type AbortReason = "user" | "logout" | "unload";
const controllers = new Map<string, { ac: AbortController; reason?: AbortReason }>();
const buffers = new Map<string, string>();
const scheduled = new Set<string>();
const sessionBoundHooks = new Map<string, (sessionId: string) => void>();
const anomalies: string[] = [];

export function getAnomalies(): readonly string[] {
  return anomalies;
}

function dispatch(id: string, action: TurnAction): TurnState | undefined {
  const entry = get(id);
  if (!entry) return undefined;
  const next = chatTurnReducer(entry.turn, action);
  if (next === entry.turn) {
    if (action.type === "event" || action.type === "tokens") {
      anomalies.push(`${id}:${action.type === "event" ? action.event.type : "tokens"}@${entry.turn.phase}`);
      if (anomalies.length > 100) anomalies.shift(); // bounded: a misbehaving server must not grow memory
    }
    return entry.turn;
  }
  put(id, { ...entry, turn: next });
  return next;
}

function bufferToken(id: string, text: string): void {
  const entry = get(id);
  if (!entry) return;
  if (entry.turn.replayed) {
    dispatch(id, { type: "tokens", text, at: config.now() }); // replay: no animation, no batching
    return;
  }
  buffers.set(id, (buffers.get(id) ?? "") + text);
  if (scheduled.has(id)) return;
  scheduled.add(id);
  config.schedule(() => {
    scheduled.delete(id);
    flush(id);
  });
}

/** Move buffered token text into the turn. Idempotent and safe to call at any time. */
export function flush(id: string): void {
  const text = buffers.get(id);
  if (!text) return;
  buffers.delete(id);
  dispatch(id, { type: "tokens", text, at: config.now() });
}

function flushAll(): void {
  for (const id of [...buffers.keys()]) flush(id);
}

let globalListenersInstalled = false;
function installGlobalListeners(): void {
  if (globalListenersInstalled || typeof document === "undefined") return;
  globalListenersInstalled = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") flushAll();
  });
  // Page leaving: abort every stream so the server stops generating. (The server persists the cancelled partial.)
  window.addEventListener("pagehide", () => stopAllChatStreams("unload"));
  // Logout / team switch / user switch ⇒ nothing from the old scope may survive.
  let lastScope = chatScopeOf(useAuthStore.getState().user);
  useAuthStore.subscribe((state) => {
    const scope = chatScopeOf(state.user);
    if (scope === lastScope) return;
    // A first-load hydration (null → scope) is not a switch; scope → null/other is.
    if (lastScope !== null) resetChatRuntime();
    lastScope = scope;
  });
}

// ─── Public API ────────────────────────────────────────────────────────────────────────────────────────────────

export interface SendOptions {
  text: string;
  sessionId: string | null;
  filters?: ChatFilters;
  /** Reuse on Retry so the backend can replay / rerun idempotently. */
  clientMessageId?: string;
  /** Called once when a NEW conversation receives its session id (the page updates the URL). */
  onSessionBound?: (sessionId: string) => void;
}

export type SendResult = { ok: true; clientMessageId: string } | { ok: false; error: TurnError };

const localError = (code: string, message: string, retryable = false): SendResult => ({
  ok: false,
  error: { kind: "local", code, message, retryable },
});

export function activeStreamCount(): number {
  return Object.values(useChatStreams.getState().streams).filter((e) => isActive(e.turn)).length;
}

export function sendChatMessage(opts: SendOptions): SendResult {
  installGlobalListeners();
  const scope = config.scope();
  if (!scope) return localError("UNAUTHENTICATED", "Your session has expired. Please sign in again.");

  const check = checkMessage(opts.text);
  if (!check.ok) return localError("INVALID_INPUT", check.problem === "empty" ? "Type a question first." : `Messages can be up to ${check.limit.toLocaleString()} characters.`);

  const streams = Object.values(useChatStreams.getState().streams).filter((e) => e.scope === scope);
  if (streams.some((e) => isActive(e.turn) && opts.sessionId !== null && e.turn.sessionId === opts.sessionId)) {
    return localError("SESSION_BUSY", "Still answering your previous question.");
  }
  // A double submit (Enter key-repeat, double click) of a NEW conversation's first message has no session id to collide
  // on yet, and would start two conversations. The same message already starting one is that same send.
  if (
    opts.sessionId === null && !opts.clientMessageId &&
    streams.some((e) => isActive(e.turn) && e.request.session_id == null && e.request.message === opts.text)
  ) {
    return localError("SESSION_BUSY", "That message is already being sent.");
  }
  if (streams.filter((e) => isActive(e.turn)).length >= CHAT_LIMITS.maxConcurrentStreams) {
    return localError("TOO_MANY_STREAMS", "Finish or stop another answer first.");
  }
  const quota = useChatQuota.getState();
  if (quotaLevel(quota, config.now()) === "exhausted") return localError("QUOTA_EXCEEDED", "You've used all of your questions for now.");
  if (quota.cooldownUntil && quota.cooldownUntil > config.now()) {
    return localError("RATE_LIMITED", "Slow down for a moment.", true);
  }

  // Starting a new question retires finished-but-unresolved turns of the same conversation (their server copies appear
  // in history after the refetch below).
  if (opts.sessionId) {
    for (const [id, e] of Object.entries(useChatStreams.getState().streams)) {
      if (e.scope === scope && e.turn.sessionId === opts.sessionId && isTerminal(e.turn)) {
        drop(id);
        void config.queryClient?.invalidateQueries({ queryKey: chatKeys.messages(scope, opts.sessionId) });
      }
    }
  }

  const clientMessageId = opts.clientMessageId ?? crypto.randomUUID();
  const filters = opts.filters ?? EMPTY_FILTERS;
  const request: ChatRequest = { session_id: opts.sessionId, message: opts.text, client_message_id: clientMessageId, filters };
  const existing = get(clientMessageId);
  const base: TurnState = existing?.turn ?? initialTurn();
  const turn = chatTurnReducer(base, { type: "send", clientMessageId, text: opts.text, filters, sessionId: opts.sessionId, at: config.now() });
  if (turn === base) return localError("SESSION_BUSY", "That message is already being sent.");

  put(clientMessageId, { turn, scope, request, committed: false, retries: existing ? existing.retries + 1 : 0 });
  if (opts.onSessionBound) sessionBoundHooks.set(clientMessageId, opts.onSessionBound);
  chatTelemetry.messageSent({
    textChars: check.count,
    newSession: opts.sessionId === null,
    filtersUsed: filters.meeting_ids.length + filters.speaker_ids.length > 0 || !!filters.date_from || !!filters.date_to,
    retry: !!existing,
  });
  void run(clientMessageId);
  return { ok: true, clientMessageId };
}

/** Retry a stopped / failed / rejected turn with the SAME client_message_id. */
export function retryChatMessage(clientMessageId: string, onSessionBound?: (sessionId: string) => void): SendResult {
  const entry = get(clientMessageId);
  if (!entry) return localError("NOT_FOUND", "Nothing to retry.");
  if (isActive(entry.turn)) return localError("SESSION_BUSY", "Still working on it.");
  buffers.delete(clientMessageId);
  return sendChatMessage({
    text: entry.request.message,
    sessionId: entry.turn.sessionId ?? entry.request.session_id ?? null,
    filters: entry.request.filters,
    clientMessageId,
    onSessionBound,
  });
}

export function stopChatStream(clientMessageId: string): void {
  const c = controllers.get(clientMessageId);
  if (c) {
    c.reason = "user";
    c.ac.abort();
  } else {
    flush(clientMessageId);
    dispatch(clientMessageId, { type: "stop", at: config.now() });
  }
}

export function dismissChatStream(clientMessageId: string): void {
  const entry = get(clientMessageId);
  if (!entry || isActive(entry.turn)) return;
  buffers.delete(clientMessageId);
  sessionBoundHooks.delete(clientMessageId);
  drop(clientMessageId);
}

export function stopAllChatStreams(reason: AbortReason = "unload"): void {
  for (const c of controllers.values()) {
    c.reason = reason;
    c.ac.abort();
  }
}

/** Logout / user switch / team switch: abort everything and forget everything. */
export function resetChatRuntime(): void {
  stopAllChatStreams("logout");
  buffers.clear();
  scheduled.clear();
  sessionBoundHooks.clear();
  useChatStreams.setState({ streams: {} });
  useChatQuota.getState().reset();
  clearChatLocalState();
  config.queryClient?.removeQueries({ queryKey: chatKeys.all });
}

export const DRAFT_PREFIX = "rapto:chat:";
/** Drafts and layout flags in sessionStorage / localStorage (never message history). */
export function clearChatLocalState(): void {
  if (typeof window === "undefined") return;
  for (const store of [window.sessionStorage, window.localStorage]) {
    try {
      for (const key of Object.keys(store)) if (key.startsWith(DRAFT_PREFIX)) store.removeItem(key);
    } catch {
      /* storage unavailable: nothing to clear */
    }
  }
}

// ─── The run loop ────────────────────────────────────────────────────────────────────────────────────────────────

async function run(id: string): Promise<void> {
  const entry = get(id);
  if (!entry) return;
  const ac = new AbortController();
  const handle: { ac: AbortController; reason?: AbortReason } = { ac };
  controllers.set(id, handle);

  try {
    for await (const ev of config.stream(entry.request, ac.signal, config.deps())) {
      onEvent(id, ev);
      if (ev.type === "done" || ev.type === "error") break;
    }
    flush(id);
    const t = get(id)?.turn;
    if (t && !isTerminal(t)) {
      // The body ended without a terminal event: the connection dropped. Never leave the UI stuck in "streaming".
      fail(id, { kind: "network", code: "CONNECTION_LOST", message: "Connection lost. Your question wasn't lost, try again.", retryable: true });
    }
  } catch (e) {
    flush(id);
    onFailure(id, e, handle.reason);
  } finally {
    controllers.delete(id);
    buffers.delete(id);
    scheduled.delete(id);
    finalize(id);
  }
}

function onEvent(id: string, ev: ChatEvent): void {
  if (ev.type === "token") {
    bufferToken(id, ev.t);
    return;
  }
  flush(id); // ordering guarantee: buffered text always lands before any non-token event
  const before = get(id)?.turn;
  const after = dispatch(id, { type: "event", event: ev, at: config.now() });
  if (!before || !after) return;

  if (ev.type === "meta" && after !== before) onMeta(id, after);
}

function onMeta(id: string, turn: TurnState): void {
  const entry = get(id);
  if (!entry || !turn.sessionId) return;
  if (turn.startedAt != null && turn.firstEventAt != null) chatTelemetry.firstEvent(turn.firstEventAt - turn.startedAt);

  const isNewSession = entry.request.session_id == null;
  if (isNewSession) {
    const qc = config.queryClient;
    if (qc) {
      const nowIso = new Date(config.now()).toISOString();
      const optimistic: ChatSession = { id: turn.sessionId, title: titleFrom(turn.userText), message_count: 1, created_at: nowIso, updated_at: nowIso };
      safeCacheWrite(() =>
        qc.setQueryData<InfiniteData<SessionList, string | null>>(chatKeys.sessions(entry.scope), (old) => {
          if (!old || old.pages.length === 0) return { pages: [{ items: [optimistic], next_cursor: null }], pageParams: [null] };
          if (old.pages.some((p) => p.items.some((s) => s.id === optimistic.id))) return old;
          const [first, ...rest] = old.pages;
          return { ...old, pages: [{ ...first, items: [optimistic, ...first.items] }, ...rest] };
        }),
      );
    }
    const hook = sessionBoundHooks.get(id);
    sessionBoundHooks.delete(id);
    hook?.(turn.sessionId);
  }
}

/** A cache side-effect must never be able to fail the user's answer (it runs inside the event loop). */
function safeCacheWrite(write: () => unknown): void {
  try {
    write();
  } catch (e) {
    console.error("[chat] cache write failed", e instanceof Error ? e.name : typeof e);
  }
}

function titleFrom(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return Array.from(t).slice(0, 60).join("");
}

function fail(id: string, error: TurnError): void {
  dispatch(id, { type: "fail", error, at: config.now() });
  if (error.kind === "network") chatTelemetry.connectionLost();
}

function errorFromInfo(info: ChatErrorInfo): TurnError {
  return {
    kind: "http",
    code: info.code,
    message: info.message,
    retryable: info.retryable,
    status: info.status,
    retryAfterS: info.retry_after_s ?? undefined,
    resetsAt: info.resets_at ?? undefined,
    requestId: info.request_id ?? undefined,
    field: info.field ?? undefined,
    reason: info.reason ?? undefined,
  };
}

function onFailure(id: string, e: unknown, abortReason: AbortReason | undefined): void {
  const entry = get(id);
  if (!entry) return;

  if (e instanceof DOMException && e.name === "AbortError") {
    if (abortReason === "logout") {
      drop(id);
      return;
    }
    dispatch(id, { type: "stop", at: config.now() }); // user Stop or page unload: partial text kept
    return;
  }

  if (e instanceof ChatRequestError) {
    const info = e.info;
    if (info.code === "DUPLICATE_IN_FLIGHT") {
      // Not an error: the same message is already being answered (another tab / a retry racing the original).
      // Wait, then pick the result up from history.
      drop(id);
      scheduleHistoryRefresh(entry.scope, entry.turn.sessionId ?? entry.request.session_id ?? null);
      return;
    }
    if (info.code === "QUOTA_EXCEEDED") {
      useChatQuota.getState().applyExhausted(info.retry_after_s ?? null, info.resets_at);
      chatTelemetry.quotaExhausted();
    } else if (info.code === "RATE_LIMITED" && info.retry_after_s) {
      useChatQuota.getState().applyCooldown(info.retry_after_s);
    }
    dispatch(id, { type: "rejected", error: errorFromInfo(info), at: config.now() });
    return;
  }

  if (e instanceof ChatStreamError) {
    const retryable = e.reason !== "version";
    const message =
      e.reason === "version" ? "Rapto was updated. Refresh the page to keep chatting."
      : e.reason === "protocol" ? "Something went wrong reading the answer. Try again."
      : "Connection lost. Your question wasn't lost, try again.";
    if (e.reason === "watchdog") chatTelemetry.watchdogFired();
    if (e.reason === "network" || e.reason === "watchdog") chatTelemetry.connectionLost();
    dispatch(id, { type: "fail", error: { kind: e.reason === "ended_early" ? "network" : e.reason, code: e.reason.toUpperCase(), message, retryable }, at: config.now() });
    return;
  }

  console.error("[chat] unexpected stream failure", e instanceof Error ? e.name : typeof e);
  dispatch(id, { type: "fail", error: { kind: "network", code: "INTERNAL", message: "Something went wrong. Try again.", retryable: true }, at: config.now() });
}

function scheduleHistoryRefresh(scope: string, sessionId: string | null): void {
  if (!sessionId) return;
  for (const delay of [2_000, 5_000, 10_000]) {
    setTimeout(() => void config.queryClient?.invalidateQueries({ queryKey: chatKeys.messages(scope, sessionId) }), delay);
  }
}

// ─── Completion: quota, cache commit, telemetry ──────────────────────────────────────────────────────────────

function finalize(id: string): void {
  const entry = get(id);
  if (!entry) return;
  const { turn } = entry;
  const qc = config.queryClient;

  if (turn.usage) useChatQuota.getState().applyUsage({ quotaRemaining: turn.usage.quotaRemaining, quota: turn.usage.quota });

  if (turn.phase === "complete") {
    if (turn.startedAt != null && turn.firstTokenAt != null) chatTelemetry.firstToken(turn.firstTokenAt - turn.startedAt);
    const seconds = turn.firstTokenAt != null && turn.doneAt != null ? (turn.doneAt - turn.firstTokenAt) / 1000 : 0;
    chatTelemetry.completed({
      finishReason: turn.finishReason ?? "stop",
      sources: turn.sources.length,
      replayed: turn.replayed,
      tokensPerSecond: turn.usage && seconds > 0.2 ? turn.usage.outputTokens / seconds : null,
    });
    if (turn.finishReason === "no_results") chatTelemetry.noResults();
    commitToCache(entry);
    // Memory hygiene only: the live tail already hides itself once history contains the message.
    setTimeout(() => dismissChatStream(id), 1_000);
  } else if (turn.phase === "stopped") {
    chatTelemetry.stopped({ byUser: turn.stoppedByUser });
    if (turn.sessionId) void qc?.invalidateQueries({ queryKey: chatKeys.sessions(entry.scope) });
  } else if ((turn.phase === "failed" || turn.phase === "rejected") && turn.error) {
    // The single place errors are reported: once per failed turn, with where it happened.
    chatTelemetry.error({
      code: turn.error.code, retryable: turn.error.retryable, kind: turn.error.kind,
      phase: turn.phase === "rejected" || turn.messageId === null ? "pre_stream" : "in_stream",
    });
    if (turn.sessionId) void qc?.invalidateQueries({ queryKey: chatKeys.sessions(entry.scope) });
  }
}

function commitToCache(entry: StreamEntry): void {
  const qc = config.queryClient;
  const { turn, scope } = entry;
  if (!qc || !turn.sessionId || !turn.messageId) {
    put(turn.clientMessageId, { ...entry, committed: true }); // nothing to write, but never leave the page waiting on it
    return;
  }

  const nowIso = (ms: number | null) => new Date(ms ?? config.now()).toISOString();
  const userMsg: ChatMessageRecord = {
    id: `local-user-${turn.clientMessageId}`, role: "user", content: turn.userText, status: "accepted",
    sources: [], created_at: nowIso(turn.startedAt),
  };
  const assistantMsg: ChatMessageRecord = {
    id: turn.messageId, role: "assistant", content: turn.text, status: "answered",
    finish_reason: turn.finishReason, sources: turn.sources, created_at: nowIso(turn.doneAt), reply_to: userMsg.id,
  };

  safeCacheWrite(() =>
    qc.setQueryData<InfiniteData<MessageList, string | null>>(chatKeys.messages(scope, turn.sessionId!), (old) => {
      if (!old || old.pages.length === 0) return { pages: [{ items: [userMsg, assistantMsg], next_cursor: null }], pageParams: [null] };
      const have = new Set(old.pages.flatMap((p) => p.items.map((m) => m.id)));
      // The server copy of this turn is already cached (a history fetch landed first): it is the whole turn, add nothing.
      // The optimistic user message has a client-made id, so id-matching alone would add it a second time.
      if (have.has(assistantMsg.id)) return old;
      const [first, ...rest] = old.pages;
      // The server persists the user message when it accepts the turn, so a history fetch that ran mid-stream already holds
      // it under its real id. A trailing user message with the same text is that copy: don't add the optimistic one too.
      const tail = first.items[first.items.length - 1];
      const serverHasUser = tail?.role === "user" && tail.content === userMsg.content;
      const add = serverHasUser ? [assistantMsg] : [userMsg, assistantMsg];
      return { ...old, pages: [{ ...first, items: [...first.items, ...add] }, ...rest] };
    }),
  );
  put(turn.clientMessageId, { ...entry, committed: true });
  // Reconcile with the server's copy (real ids, persisted text — identical by Day 58's guarantee).
  void qc.invalidateQueries({ queryKey: chatKeys.messages(scope, turn.sessionId) });
  void qc.invalidateQueries({ queryKey: chatKeys.sessions(scope) });
}

/** Test hook: forget all runtime state without touching the auth store. */
export function __resetManagerForTests(): void {
  for (const c of controllers.values()) c.ac.abort();
  controllers.clear();
  buffers.clear();
  scheduled.clear();
  sessionBoundHooks.clear();
  anomalies.length = 0;
  useChatStreams.setState({ streams: {} });
  useChatQuota.getState().reset();
}
