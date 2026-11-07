// @vitest-environment jsdom
import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatRequestError, ChatStreamError, streamChatQuery } from "@/features/intelligence/api/chatClient";
import { chatKeys } from "@/features/intelligence/state/chatKeys";
import { useChatQuota } from "@/features/intelligence/state/chatQuotaStore";
import {
  __resetManagerForTests, activeStreamCount, configureStreamManager, dismissChatStream, getAnomalies, resetChatRuntime, retryChatMessage,
  sendChatMessage, stopChatStream, useChatStreams,
} from "@/features/intelligence/state/streamManager";
import { decodeEvent, type ChatEvent, type MessageList, type SessionList } from "@/lib/contracts/chat";
import { encodeTranscript, goldenNames, loadGolden, streamOf } from "../harness/transcripts";

const SCOPE = "team_1:user_1";
const ev = (name: string, data: Record<string, unknown>): ChatEvent => decodeEvent(name, JSON.stringify({ v: 1, ...data }))!;
const META = (over: Record<string, unknown> = {}) => ev("meta", { request_id: "r1", session_id: "sess-1", message_id: "msg-1", replayed: false, ...over });
const tick = () => new Promise((r) => setTimeout(r, 0));

/** A stream the test drives by hand. */
function controlled() {
  const queue: Array<ChatEvent | Error | "end"> = [];
  let wake: (() => void) | null = null;
  const push = (x: ChatEvent | Error | "end") => {
    queue.push(x);
    wake?.();
  };
  const stream = vi.fn().mockImplementation(async function* (_req: unknown, signal: AbortSignal) {
    for (;;) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const next = queue.shift();
      if (next === undefined) {
        await new Promise<void>((r) => {
          wake = r;
          signal.addEventListener("abort", () => r(), { once: true });
        });
        continue;
      }
      if (next === "end") return;
      if (next instanceof Error) throw next;
      yield next;
    }
  });
  return { stream: stream as unknown as typeof streamChatQuery, push, calls: stream };
}

let qc: QueryClient;
let rafCallbacks: Array<() => void>;
let now = 1_000;

beforeEach(() => {
  __resetManagerForTests();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  rafCallbacks = [];
  now = 1_000;
  configureStreamManager({
    queryClient: qc,
    scope: () => SCOPE,
    now: () => ++now,
    // A scheduler that NEVER fires on its own: proves correctness does not depend on rAF timing.
    schedule: (cb) => void rafCallbacks.push(cb),
    deps: () => ({}),
    stream: streamChatQuery,
  });
});
afterEach(() => {
  __resetManagerForTests();
  vi.restoreAllMocks();
});

const entries = () => Object.values(useChatStreams.getState().streams);
const only = () => entries()[0];
const waitFor = async (pred: () => boolean, ms = 2000) => {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error("waitFor timed out");
    await tick();
  }
};

describe("full-stack replay: fake fetch → client → reducer → manager", () => {
  for (const name of goldenNames()) {
    it(`${name}: final state matches the transcript, text == concatenated tokens`, async () => {
      const fetchImpl = vi.fn().mockResolvedValue(new Response(streamOf([encodeTranscript(loadGolden(name))]), { status: 200 }));
      configureStreamManager({ deps: () => ({ fetchImpl }) });
      const r = sendChatMessage({ text: "q", sessionId: null });
      expect(r.ok).toBe(true);
      await waitFor(() => ["complete", "stopped", "failed"].includes(only().turn.phase));
      const t = only().turn;
      const tokens = loadGolden(name).filter((e) => e.event === "token").map((e) => String(e.data.t)).join("");
      expect(t.text).toBe(tokens);
      const sources = loadGolden(name).find((e) => e.event === "sources");
      if (sources) expect(t.sources).toHaveLength((sources.data.sources as unknown[]).length);
      expect(getAnomalies()).toEqual([]);
    });
  }

  it("happy: quota is taken from the usage event, and the turn is committed to the cache", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(streamOf([encodeTranscript(loadGolden("happy"))]), { status: 200 }));
    configureStreamManager({ deps: () => ({ fetchImpl }) });
    sendChatMessage({ text: "What did Ahmed commit to?", sessionId: null });
    await waitFor(() => only().turn.phase === "complete");
    await waitFor(() => only().committed);
    expect(useChatQuota.getState().remaining).toBe(199);
    const cached = qc.getQueryData<InfiniteData<MessageList>>(chatKeys.messages(SCOPE, only().turn.sessionId!));
    const items = cached!.pages[0].items;
    expect(items.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(items[0].content).toBe("What did Ahmed commit to?");
    expect(items[1].content).toBe("Ahmed will ship billing by Friday [S1]. Sara reviews it [S1].");
    expect(items[1].sources).toHaveLength(2);
  });
});

describe("token batching and ordering", () => {
  it("flushes buffered text BEFORE `done`, even if the frame scheduler never runs", async () => {
    const c = controlled();
    configureStreamManager({ stream: c.stream });
    sendChatMessage({ text: "q", sessionId: null });
    c.push(META());
    c.push(ev("token", { t: "Hello " }));
    c.push(ev("token", { t: "world" }));
    c.push(ev("done", { finish_reason: "stop" }));
    await waitFor(() => only().turn.phase === "complete");
    expect(only().turn.text).toBe("Hello world"); // would be "" if done overtook the buffer
    expect(rafCallbacks.length).toBeGreaterThan(0); // the scheduler was asked, but never ran
  });

  it("coalesces many tokens into one store update per frame", async () => {
    const c = controlled();
    configureStreamManager({ stream: c.stream });
    sendChatMessage({ text: "q", sessionId: null });
    c.push(META());
    await waitFor(() => only().turn.phase === "streaming");
    let updates = 0;
    const unsub = useChatStreams.subscribe(() => updates++);
    for (let i = 0; i < 40; i++) c.push(ev("token", { t: `t${i} ` }));
    await waitFor(() => rafCallbacks.length > 0);
    await tick();
    expect(only().turn.text).toBe(""); // nothing rendered until the frame fires
    rafCallbacks.splice(0).forEach((cb) => cb());
    unsub();
    expect(only().turn.text.startsWith("t0 t1 ")).toBe(true);
    expect(only().turn.text.endsWith("t39 ")).toBe(true);
    expect(updates).toBe(1);
  });

  it("flushes stranded text when a hidden tab becomes visible again", async () => {
    const c = controlled();
    configureStreamManager({ stream: c.stream });
    sendChatMessage({ text: "q", sessionId: null });
    c.push(META());
    c.push(ev("token", { t: "while hidden" }));
    await waitFor(() => rafCallbacks.length > 0);
    expect(only().turn.text).toBe("");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(only().turn.text).toBe("while hidden");
  });

  it("replayed answers appear instantly with no batching", async () => {
    const c = controlled();
    configureStreamManager({ stream: c.stream });
    sendChatMessage({ text: "q", sessionId: null });
    c.push(META({ replayed: true }));
    c.push(ev("token", { t: "stored answer" }));
    await waitFor(() => only().turn.text === "stored answer");
    expect(rafCallbacks).toHaveLength(0);
    expect(only().turn.replayed).toBe(true);
  });
});

describe("concurrency guards", () => {
  it("allows two concurrent streams, refuses a third, and one-per-session", async () => {
    const a = controlled();
    configureStreamManager({ stream: a.stream });
    expect(sendChatMessage({ text: "one", sessionId: "sess-A" }).ok).toBe(true);
    const sameSession = sendChatMessage({ text: "again", sessionId: "sess-A" });
    expect(sameSession).toMatchObject({ ok: false, error: { code: "SESSION_BUSY" } });
    // A stream is bound to its session once `meta` arrives for new chats; for existing ones it is known up-front.
    expect(sendChatMessage({ text: "two", sessionId: "sess-B" }).ok).toBe(true);
    expect(activeStreamCount()).toBe(2);
    expect(sendChatMessage({ text: "three", sessionId: "sess-C" })).toMatchObject({ ok: false, error: { code: "TOO_MANY_STREAMS" } });
  });

  it("a stream started in session A survives while the user views session B, and finishes completely", async () => {
    const c = controlled();
    configureStreamManager({ stream: c.stream });
    sendChatMessage({ text: "q", sessionId: "sess-A" });
    c.push(META({ session_id: "sess-A" }));
    c.push(ev("token", { t: "partial " }));
    await waitFor(() => rafCallbacks.length > 0);
    // "navigate" to B: nothing about the stream changes — it is owned by the manager, not a component.
    expect(only().turn.phase).toBe("streaming");
    c.push(ev("token", { t: "answer" }));
    c.push(ev("done", { finish_reason: "stop" }));
    await waitFor(() => only().turn.phase === "complete");
    expect(only().turn.text).toBe("partial answer");
  });

  it("refuses locally when the quota is exhausted or a cool-down is active", () => {
    useChatQuota.getState().applyExhausted(3600);
    expect(sendChatMessage({ text: "q", sessionId: null })).toMatchObject({ ok: false, error: { code: "QUOTA_EXCEEDED" } });
    useChatQuota.getState().reset();
    useChatQuota.getState().applyCooldown(30);
    expect(sendChatMessage({ text: "q", sessionId: null })).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
  });

  it("validates the message locally (empty, over the code-point limit)", () => {
    expect(sendChatMessage({ text: "   ", sessionId: null })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(sendChatMessage({ text: "x".repeat(2001), sessionId: null })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(sendChatMessage({ text: "😀".repeat(2000), sessionId: null }).ok).toBe(true);
  });

  it("refuses when signed out", () => {
    configureStreamManager({ scope: () => null });
    expect(sendChatMessage({ text: "q", sessionId: null })).toMatchObject({ ok: false, error: { code: "UNAUTHENTICATED" } });
  });
});

describe("new sessions", () => {
  it("binds the session on `meta`: calls the hook once and inserts an optimistic sidebar item", async () => {
    const c = controlled();
    configureStreamManager({ stream: c.stream });
    const bound = vi.fn();
    sendChatMessage({ text: "What did we decide about pricing?", sessionId: null, onSessionBound: bound });
    c.push(META());
    await waitFor(() => bound.mock.calls.length === 1);
    expect(bound).toHaveBeenCalledWith("sess-1");
    const list = qc.getQueryData<InfiniteData<SessionList>>(chatKeys.sessions(SCOPE));
    expect(list!.pages[0].items[0]).toMatchObject({ id: "sess-1", title: "What did we decide about pricing?" });
    c.push(ev("done", { finish_reason: "stop" }));
    await waitFor(() => only().turn.phase === "complete");
    expect(bound).toHaveBeenCalledTimes(1);
  });
});

describe("first message is never shown twice", () => {
  const rec = (id: string, role: "user" | "assistant", content: string) =>
    ({ id, role, content, status: role === "user" ? "answered" : "answered", sources: [], created_at: new Date(0).toISOString() }) as MessageList["items"][number];
  const finish = async (c: ReturnType<typeof controlled>) => {
    c.push(META({ message_id: "msg-1" }));
    c.push(ev("token", { t: "answer" }));
    c.push(ev("done", { finish_reason: "stop" }));
    await waitFor(() => only().committed);
  };
  const cached = () => qc.getQueryData<InfiniteData<MessageList>>(chatKeys.messages(SCOPE, "sess-1"))!.pages[0].items;

  it("does not add the optimistic user message when the server copy of the turn is already cached", async () => {
    const c = controlled();
    configureStreamManager({ stream: c.stream });
    qc.setQueryData<InfiniteData<MessageList>>(chatKeys.messages(SCOPE, "sess-1"), {
      pages: [{ items: [rec("srv-user", "user", "hello"), rec("msg-1", "assistant", "answer")], next_cursor: null }], pageParams: [null],
    });
    sendChatMessage({ text: "hello", sessionId: null });
    await finish(c);
    expect(cached().map((m) => m.id)).toEqual(["srv-user", "msg-1"]);
  });

  it("does not add it when a mid-stream fetch already stored the server's user message", async () => {
    const c = controlled();
    configureStreamManager({ stream: c.stream });
    qc.setQueryData<InfiniteData<MessageList>>(chatKeys.messages(SCOPE, "sess-1"), {
      pages: [{ items: [rec("srv-user", "user", "hello")], next_cursor: null }], pageParams: [null],
    });
    sendChatMessage({ text: "hello", sessionId: null });
    await finish(c);
    expect(cached().map((m) => `${m.role}:${m.id}`)).toEqual(["user:srv-user", "assistant:msg-1"]);
  });

  it("still adds it when the same text was asked earlier in the conversation", async () => {
    const c = controlled();
    configureStreamManager({ stream: c.stream });
    qc.setQueryData<InfiniteData<MessageList>>(chatKeys.messages(SCOPE, "sess-1"), {
      pages: [{ items: [rec("u0", "user", "hello"), rec("a0", "assistant", "old answer")], next_cursor: null }], pageParams: [null],
    });
    sendChatMessage({ text: "hello", sessionId: null });
    await finish(c);
    expect(cached().map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
  });

  it("a double submit of a new conversation's first message starts one request, not two", () => {
    const c = controlled();
    configureStreamManager({ stream: c.stream });
    expect(sendChatMessage({ text: "hello", sessionId: null }).ok).toBe(true);
    expect(sendChatMessage({ text: "hello", sessionId: null })).toMatchObject({ ok: false, error: { code: "SESSION_BUSY" } });
    expect(c.calls).toHaveBeenCalledTimes(1);
    expect(sendChatMessage({ text: "something else", sessionId: null }).ok).toBe(true);
  });
});

describe("stop, failure and retry", () => {
  it("Stop aborts the controller, keeps partial text and allows retry with the same id", async () => {
    const c = controlled();
    configureStreamManager({ stream: c.stream });
    const r = sendChatMessage({ text: "q", sessionId: null });
    const id = (r as { clientMessageId: string }).clientMessageId;
    c.push(META());
    c.push(ev("token", { t: "partial" }));
    await waitFor(() => rafCallbacks.length > 0);
    stopChatStream(id);
    await waitFor(() => only().turn.phase === "stopped");
    expect(only().turn).toMatchObject({ text: "partial", stoppedByUser: true });
    expect(activeStreamCount()).toBe(0);

    const c2 = controlled();
    configureStreamManager({ stream: c2.stream });
    const again = retryChatMessage(id);
    expect(again).toEqual({ ok: true, clientMessageId: id });
    expect((c2.calls.mock.calls[0][0] as { client_message_id: string }).client_message_id).toBe(id);
    c2.push(META({ replayed: false, message_id: "msg-2" }));
    c2.push(ev("token", { t: "full answer" }));
    c2.push(ev("done", { finish_reason: "stop" }));
    await waitFor(() => only().turn.phase === "complete");
    expect(only().turn.text).toBe("full answer"); // partial text from the stopped attempt is not carried over
  });

  it("maps a pre-stream QUOTA_EXCEEDED to `rejected`, records exhaustion, and blocks further sends", async () => {
    const c = controlled();
    configureStreamManager({ stream: c.stream });
    sendChatMessage({ text: "q", sessionId: null });
    c.push(new ChatRequestError({ code: "QUOTA_EXCEEDED", message: "limit", retryable: false, status: 429, retry_after_s: 3600 }));
    await waitFor(() => only().turn.phase === "rejected");
    expect(only().turn.error).toMatchObject({ code: "QUOTA_EXCEEDED", status: 429, retryAfterS: 3600 });
    expect(useChatQuota.getState().remaining).toBe(0);
    expect(sendChatMessage({ text: "again", sessionId: null })).toMatchObject({ ok: false, error: { code: "QUOTA_EXCEEDED" } });
  });

  it("starts a cool-down on RATE_LIMITED", async () => {
    const c = controlled();
    configureStreamManager({ stream: c.stream });
    sendChatMessage({ text: "q", sessionId: null });
    c.push(new ChatRequestError({ code: "RATE_LIMITED", message: "slow", retryable: true, status: 429, retry_after_s: 20 }));
    await waitFor(() => only().turn.phase === "rejected");
    expect(useChatQuota.getState().cooldownUntil).toBeGreaterThan(Date.now() + 15_000);
  });

  it("treats DUPLICATE_IN_FLIGHT as wait-and-refresh, not an error", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const spy = vi.spyOn(qc, "invalidateQueries");
    const c = controlled();
    configureStreamManager({ stream: c.stream });
    sendChatMessage({ text: "q", sessionId: "sess-A" });
    c.push(new ChatRequestError({ code: "DUPLICATE_IN_FLIGHT", message: "busy", retryable: false, status: 409 }));
    await vi.waitFor(() => expect(entries()).toHaveLength(0));
    await vi.advanceTimersByTimeAsync(2_100);
    expect(spy).toHaveBeenCalledWith({ queryKey: chatKeys.messages(SCOPE, "sess-A") });
    vi.useRealTimers();
  });

  it("a network ChatStreamError fails the turn as retryable and keeps partial text", async () => {
    const c = controlled();
    configureStreamManager({ stream: c.stream });
    sendChatMessage({ text: "q", sessionId: null });
    c.push(META());
    c.push(ev("token", { t: "so far" }));
    c.push(new ChatStreamError("network", "x"));
    await waitFor(() => only().turn.phase === "failed");
    expect(only().turn).toMatchObject({ text: "so far", error: { kind: "network", retryable: true } });
  });

  it("a version mismatch is not retryable", async () => {
    const c = controlled();
    configureStreamManager({ stream: c.stream });
    sendChatMessage({ text: "q", sessionId: null });
    c.push(new ChatStreamError("version", "x"));
    await waitFor(() => only().turn.phase === "failed");
    expect(only().turn.error).toMatchObject({ kind: "version", retryable: false });
  });

  it("a body that ends without a terminal event becomes a retryable Connection lost, never a stuck spinner", async () => {
    const c = controlled();
    configureStreamManager({ stream: c.stream });
    sendChatMessage({ text: "q", sessionId: null });
    c.push(META());
    c.push(ev("token", { t: "cut off" }));
    c.push("end");
    await waitFor(() => only().turn.phase === "failed");
    expect(only().turn).toMatchObject({ text: "cut off", error: { code: "CONNECTION_LOST", retryable: true } });
  });

  it("an in-stream error event keeps the partial answer", async () => {
    const c = controlled();
    configureStreamManager({ stream: c.stream });
    sendChatMessage({ text: "q", sessionId: null });
    c.push(META());
    c.push(ev("token", { t: "partial" }));
    c.push(ev("error", { code: "TIMEOUT", message: "slow", retryable: true }));
    await waitFor(() => only().turn.phase === "failed");
    expect(only().turn).toMatchObject({ text: "partial", error: { code: "TIMEOUT", retryable: true } });
  });

  it("starting a new question retires the finished-but-unresolved turn of that session", async () => {
    const c = controlled();
    configureStreamManager({ stream: c.stream });
    sendChatMessage({ text: "first", sessionId: "sess-A" });
    c.push(new ChatStreamError("network", "x"));
    await waitFor(() => only().turn.phase === "failed");
    const failedId = only().turn.clientMessageId;
    const c2 = controlled();
    configureStreamManager({ stream: c2.stream });
    sendChatMessage({ text: "second", sessionId: "sess-A" });
    expect(useChatStreams.getState().streams[failedId]).toBeUndefined();
  });
});

describe("logout, team switch and leaks", () => {
  it("resetChatRuntime aborts streams and wipes store, quota, cache and drafts", async () => {
    const c = controlled();
    configureStreamManager({ stream: c.stream });
    sessionStorage.setItem("rapto:chat:draft:team_1:user_1:new", "secret draft");
    sessionStorage.setItem("unrelated", "keep");
    useChatQuota.getState().applyUsage({ quotaRemaining: 5, quota: null });
    qc.setQueryData(chatKeys.sessions(SCOPE), { pages: [], pageParams: [] });
    sendChatMessage({ text: "q", sessionId: null });
    c.push(META());
    await waitFor(() => only().turn.phase === "streaming");

    resetChatRuntime();
    await tick();
    expect(entries()).toHaveLength(0);
    expect(activeStreamCount()).toBe(0);
    expect(useChatQuota.getState().remaining).toBeNull();
    expect(qc.getQueryData(chatKeys.sessions(SCOPE))).toBeUndefined();
    expect(sessionStorage.getItem("rapto:chat:draft:team_1:user_1:new")).toBeNull();
    expect(sessionStorage.getItem("unrelated")).toBe("keep");
  });

  it("50 start/stop cycles leave no controllers, buffers or active streams behind", async () => {
    for (let i = 0; i < 50; i++) {
      const c = controlled();
      configureStreamManager({ stream: c.stream });
      const r = sendChatMessage({ text: `q${i}`, sessionId: null });
      const id = (r as { clientMessageId: string }).clientMessageId;
      c.push(META({ session_id: `s${i}`, message_id: `m${i}` }));
      c.push(ev("token", { t: "x" }));
      await waitFor(() => useChatStreams.getState().streams[id]?.turn.phase === "streaming");
      stopChatStream(id);
      await waitFor(() => useChatStreams.getState().streams[id]?.turn.phase === "stopped");
      dismissChatStream(id);
    }
    await tick();
    expect(entries()).toHaveLength(0);
    expect(activeStreamCount()).toBe(0);
  });
});
