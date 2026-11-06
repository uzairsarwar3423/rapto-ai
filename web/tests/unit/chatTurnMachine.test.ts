import { describe, expect, it } from "vitest";
import { decodeEvent, type ChatEvent } from "@/lib/contracts/chat";
import {
  canRetry, chatTurnReducer, deriveOutcome, EMPTY_FILTERS, hasPartialText, initialTurn, type TurnAction, type TurnState,
} from "@/features/intelligence/state/chatTurnMachine";
import { goldenNames, loadGolden } from "../harness/transcripts";

const CMID = "11111111-1111-4111-8111-111111111111";
const send = (at = 0): TurnAction => ({ type: "send", clientMessageId: CMID, text: "hello", filters: EMPTY_FILTERS, sessionId: null, at });
const ev = (name: string, data: Record<string, unknown>): ChatEvent => decodeEvent(name, JSON.stringify({ v: 1, ...data }))!;
const META = ev("meta", { request_id: "r1", session_id: "s1", message_id: "m1", replayed: false });

function run(actions: TurnAction[], from: TurnState = initialTurn()): TurnState {
  return actions.reduce(chatTurnReducer, from);
}
const e = (event: ChatEvent, at = 1): TurnAction => ({ type: "event", event, at });

describe("chatTurnMachine transitions", () => {
  it("idle → sending → streaming → complete", () => {
    let s = run([send(100)]);
    expect(s.phase).toBe("sending");
    s = run([e(META, 110)], s);
    expect(s).toMatchObject({ phase: "streaming", sessionId: "s1", messageId: "m1", requestId: "r1", firstEventAt: 110 });
    s = run([e(ev("token", { t: "Hi" }), 120), e(ev("done", { finish_reason: "stop" }), 130)], s);
    expect(s).toMatchObject({ phase: "complete", text: "Hi", finishReason: "stop", firstTokenAt: 120, doneAt: 130 });
    expect(deriveOutcome(s)).toBe("answer");
  });

  it("ignores every non-meta event before meta (returns the same object)", () => {
    const s = run([send()]);
    for (const ev2 of [ev("token", { t: "x" }), ev("done", { finish_reason: "stop" }), ev("sources", { sources: [] })]) {
      expect(chatTurnReducer(s, e(ev2))).toBe(s);
    }
  });

  it("ignores events after a terminal phase and a duplicate meta", () => {
    const done = run([send(), e(META), e(ev("done", { finish_reason: "stop" }))]);
    expect(chatTurnReducer(done, e(ev("token", { t: "late" })))).toBe(done);
    expect(chatTurnReducer(done, { type: "tokens", text: "late", at: 5 })).toBe(done);
    const streaming = run([send(), e(META)]);
    expect(chatTurnReducer(streaming, e(META))).toBe(streaming);
  });

  it("refuses a send while a turn is active, and accepts it again after a terminal phase (retry)", () => {
    const active = run([send(), e(META)]);
    expect(chatTurnReducer(active, send())).toBe(active);
    const stopped = chatTurnReducer(active, { type: "stop", at: 9 });
    const again = chatTurnReducer(stopped, send(20));
    expect(again).toMatchObject({ phase: "sending", clientMessageId: CMID, text: "", startedAt: 20 });
  });

  it("batched `tokens` actions append in order and set first-token time once", () => {
    const s = run([send(), e(META), { type: "tokens", text: "Hel", at: 10 }, { type: "tokens", text: "lo", at: 20 }]);
    expect(s.text).toBe("Hello");
    expect(s.firstTokenAt).toBe(10);
    expect(s.stage).toBe("answering");
  });

  it("records one step per stage and merges repeated stage details", () => {
    const s = run([
      send(), e(META, 1),
      e(ev("status", { stage: "rewriting" }), 2),
      e(ev("status", { stage: "searching", detail: { question: "q" } }), 3),
      e(ev("status", { stage: "searching", detail: { question: "q2" } }), 4),
      e(ev("status", { stage: "reading" }), 5),
    ]);
    expect(s.steps.map((x) => x.stage)).toEqual(["rewriting", "searching", "reading"]);
    expect(s.steps[1].detail).toEqual({ question: "q2" });
    expect(s.stage).toBe("reading");
  });

  it("user Stop keeps partial text and is retryable", () => {
    const s = run([send(), e(META), { type: "tokens", text: "part", at: 3 }, { type: "stop", at: 4 }]);
    expect(s).toMatchObject({ phase: "stopped", text: "part", stoppedByUser: true });
    expect(deriveOutcome(s)).toBe("stopped");
    expect(hasPartialText(s)).toBe(true);
    expect(canRetry(s)).toBe(true);
  });

  it("server `cancelled` maps to stopped, not complete", () => {
    const s = run([send(), e(META), e(ev("done", { finish_reason: "cancelled" }))]);
    expect(s.phase).toBe("stopped");
    expect(s.stoppedByUser).toBe(false);
  });

  it("in-stream error keeps partial text and honours retryable", () => {
    const s = run([send(), e(META), { type: "tokens", text: "abc", at: 3 }, e(ev("error", { code: "TIMEOUT", message: "slow", retryable: true }))]);
    expect(s).toMatchObject({ phase: "failed", text: "abc" });
    expect(s.error).toMatchObject({ kind: "stream", code: "TIMEOUT", retryable: true });
    expect(canRetry(s)).toBe(true);
    expect(hasPartialText(s)).toBe(true);
  });

  it("CONTENT_FILTERED is never retryable and maps to the filtered outcome", () => {
    const s = run([send(), e(META), e(ev("error", { code: "CONTENT_FILTERED", message: "m", retryable: true }))]);
    expect(s.error?.retryable).toBe(false);
    expect(deriveOutcome(s)).toBe("filtered");
    expect(canRetry(s)).toBe(false);
  });

  it("pre-stream rejection leaves no assistant content", () => {
    const err = { kind: "http" as const, code: "RATE_LIMITED", message: "slow down", retryable: true, status: 429, retryAfterS: 12 };
    const s = run([send(), { type: "rejected", error: err, at: 5 }]);
    expect(s).toMatchObject({ phase: "rejected", text: "", sources: [] });
    expect(deriveOutcome(s)).toBe("error");
    expect(canRetry(s)).toBe(true);
  });

  it("rejection is only valid from `sending`", () => {
    const streaming = run([send(), e(META)]);
    expect(chatTurnReducer(streaming, { type: "rejected", error: { kind: "http", code: "X", message: "", retryable: false }, at: 1 })).toBe(streaming);
  });

  it("quota exhaustion is not retryable", () => {
    const err = { kind: "http" as const, code: "QUOTA_EXCEEDED", message: "", retryable: false, status: 429 };
    expect(canRetry(run([send(), { type: "rejected", error: err, at: 1 }]))).toBe(false);
  });

  it("network failure / watchdog become failed with partial text preserved", () => {
    const s = run([send(), e(META), { type: "tokens", text: "so far", at: 2 }, { type: "fail", error: { kind: "watchdog", code: "WATCHDOG", message: "lost", retryable: true }, at: 3 }]);
    expect(s).toMatchObject({ phase: "failed", text: "so far" });
    expect(s.error?.kind).toBe("watchdog");
  });

  it("derives outcomes for each finish reason", () => {
    const outcome = (reason: string) => deriveOutcome(run([send(), e(META), e(ev("done", { finish_reason: reason }))]));
    expect(outcome("stop")).toBe("answer");
    expect(outcome("no_results")).toBe("no_results");
    expect(outcome("length")).toBe("truncated");
    expect(outcome("filtered")).toBe("filtered");
    expect(outcome("cancelled")).toBe("stopped");
  });

  it("usage carries remaining quota, preferring the amended quota object", () => {
    const a = run([send(), e(META), e(ev("usage", { input_tokens: 1, output_tokens: 2, quota_remaining: 7 }))]);
    expect(a.usage?.quotaRemaining).toBe(7);
    const b = run([send(), e(META), e(ev("usage", { input_tokens: 1, output_tokens: 2, quota_remaining: 7, quota: { scope: "team", limit: 100, remaining: 5 } }))]);
    expect(b.usage?.quotaRemaining).toBe(5);
  });
});

describe("headless replay of every golden transcript", () => {
  const expected: Record<string, Partial<TurnState> & { outcome: string }> = {
    happy: { phase: "complete", finishReason: "stop", outcome: "answer" },
    chitchat: { phase: "complete", finishReason: "stop", outcome: "answer" },
    no_results: { phase: "complete", finishReason: "no_results", outcome: "no_results" },
    cancelled: { phase: "stopped", outcome: "stopped" },
    replay: { phase: "complete", replayed: true, outcome: "answer" },
    analytics: { phase: "complete", outcome: "answer" },
    error: { phase: "failed", outcome: "error" },
    mid_stream_error: { phase: "failed", outcome: "error" },
  };

  for (const name of goldenNames()) {
    it(`${name}: reaches the expected terminal state with text == concatenated tokens`, () => {
      const golden = loadGolden(name);
      const events = golden.map((g) => decodeEvent(g.event, JSON.stringify(g.data))!);
      let s = chatTurnReducer(initialTurn(), send(0));
      let t = 1;
      for (const event of events) {
        const next = chatTurnReducer(s, e(event, t++));
        expect(next, `${name}: event ${event.type} was ignored`).not.toBe(s);
        s = next;
      }
      const joined = events.filter((x) => x.type === "token").map((x) => (x as { t: string }).t).join("");
      expect(s.text).toBe(joined);
      expect(["complete", "stopped", "failed"]).toContain(s.phase);
      const want = expected[name];
      if (want) {
        const { outcome, ...fields } = want;
        expect(s).toMatchObject(fields);
        expect(deriveOutcome(s)).toBe(outcome);
      }
      const sources = events.find((x) => x.type === "sources");
      if (sources && sources.type === "sources") expect(s.sources).toEqual(sources.sources);
    });
  }

  it("filtered_canary ends in the filtered outcome", () => {
    const events = loadGolden("filtered_canary").map((g) => decodeEvent(g.event, JSON.stringify(g.data))!);
    const s = events.reduce((acc, x) => chatTurnReducer(acc, e(x)), chatTurnReducer(initialTurn(), send()));
    expect(deriveOutcome(s)).toBe("filtered");
  });
});
