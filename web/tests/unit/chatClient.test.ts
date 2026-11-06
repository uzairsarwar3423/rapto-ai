import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatRequestError, ChatStreamError, streamChatQuery } from "@/features/intelligence/api/chatClient";
import type { ChatEvent, ChatRequest } from "@/lib/contracts/chat";
import { encodeTranscript, loadGolden, streamOf } from "../harness/transcripts";

const REQ: ChatRequest = {
  message: "hello",
  client_message_id: "33333333-3333-4333-8333-333333333333",
  session_id: null,
  filters: { meeting_ids: [], speaker_ids: [] },
};
const enc = new TextEncoder();
const sse = (events: string) => new Response(streamOf([enc.encode(events)]), { status: 200, headers: { "content-type": "text/event-stream" } });
const happy = () => new Response(streamOf([encodeTranscript(loadGolden("happy"))]), { status: 200, headers: { "content-type": "text/event-stream" } });
const envelope = (status: number, error: Record<string, unknown>, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json", "x-request-id": "rid-1", ...headers } });

async function collect(gen: AsyncGenerator<ChatEvent>): Promise<ChatEvent[]> {
  const out: ChatEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}
const run = (deps: Parameters<typeof streamChatQuery>[2], signal = new AbortController().signal) => collect(streamChatQuery(REQ, signal, deps));

afterEach(() => {
  vi.useRealTimers();
});

describe("streamChatQuery", () => {
  it("posts the request with the bearer token and yields the golden events", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(happy());
    const events = await run({ fetchImpl, getAccessToken: () => "tok-1" });
    expect(events.map((e) => e.type)).toEqual(loadGolden("happy").map((e) => e.event));
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/ai/chat/query");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok-1");
    expect(JSON.parse(init.body)).toEqual(REQ);
  });

  it("on 401 refreshes the token ONCE and retries with the new token", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(envelope(401, { code: "UNAUTHENTICATED", message: "x", retryable: false })).mockResolvedValueOnce(happy());
    const refresh = vi.fn().mockResolvedValue("tok-2");
    const events = await run({ fetchImpl, getAccessToken: () => "tok-1", refreshAccessToken: refresh });
    expect(events.length).toBeGreaterThan(0);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBe("Bearer tok-2");
  });

  it("does not loop: a second 401 after refresh surfaces as UNAUTHENTICATED", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => envelope(401, { code: "UNAUTHENTICATED", message: "x", retryable: false }));
    const refresh = vi.fn().mockResolvedValue("tok-2");
    await expect(run({ fetchImpl, getAccessToken: () => "t", refreshAccessToken: refresh })).rejects.toMatchObject({ info: { code: "UNAUTHENTICATED", status: 401 } });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("surfaces UNAUTHENTICATED when the refresh itself fails (no retry request is sent)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(envelope(401, { code: "UNAUTHENTICATED", message: "x", retryable: false }));
    await expect(run({ fetchImpl, refreshAccessToken: async () => null })).rejects.toBeInstanceOf(ChatRequestError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps a pre-stream HTTP error to ChatRequestError with Retry-After and the request id", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(envelope(429, { code: "RATE_LIMITED", message: "Slow down", retryable: true }, { "retry-after": "12" }));
    await expect(run({ fetchImpl })).rejects.toMatchObject({
      info: { code: "RATE_LIMITED", status: 429, retry_after_s: 12, request_id: "rid-1", retryable: true },
    });
  });

  it("falls back to a generic error when the body is not our envelope", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("<html>bad gateway</html>", { status: 502 }));
    await expect(run({ fetchImpl })).rejects.toMatchObject({ info: { code: "SERVICE_UNAVAILABLE", status: 502, retryable: true } });
  });

  it("silently retries ONCE when the network fails before any response", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(happy());
    const events = await run({ fetchImpl, silentRetryDelayMs: 1 });
    expect(events.length).toBeGreaterThan(0);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).client_message_id).toBe(REQ.client_message_id); // same id: idempotent
  });

  it("gives up after the single silent retry with a network ChatStreamError", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(run({ fetchImpl, silentRetryDelayMs: 1 })).rejects.toMatchObject({ name: "ChatStreamError", reason: "network" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("classifies bad frames as protocol errors and newer versions as version errors", async () => {
    const bad = vi.fn().mockResolvedValue(sse("event: token\ndata: {nope\n\n"));
    await expect(run({ fetchImpl: bad })).rejects.toMatchObject({ reason: "protocol" });
    const newer = vi.fn().mockResolvedValue(sse('event: token\ndata: {"v":2,"t":"x"}\n\n'));
    await expect(run({ fetchImpl: newer })).rejects.toMatchObject({ reason: "version" });
  });

  it("a user abort mid-stream throws AbortError and cancels the body", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('event: token\ndata: {"v":1,"t":"a"}\n\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    const ac = new AbortController();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    const gen = streamChatQuery(REQ, ac.signal, { fetchImpl });
    expect((await gen.next()).value).toMatchObject({ type: "token" });
    ac.abort();
    await expect(gen.next()).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelled).toBe(true);
  });

  it("aborting before the request starts never calls fetch", async () => {
    const ac = new AbortController();
    ac.abort();
    const fetchImpl = vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError"));
    await expect(run({ fetchImpl }, ac.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("idle watchdog (35 s)", () => {
  function controlledStream() {
    let ctrl!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        ctrl = c;
      },
    });
    return { body, push: (s: string) => ctrl.enqueue(enc.encode(s)), close: () => ctrl.close() };
  }

  it("fires after 35 s of silence and not before", async () => {
    vi.useFakeTimers();
    const s = controlledStream();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(s.body, { status: 200 }));
    const p = collect(streamChatQuery(REQ, new AbortController().signal, { fetchImpl }));
    const settled = p.then(() => "ok", (e) => e as Error);
    s.push('event: meta\ndata: {"v":1,"request_id":"r","session_id":"s","message_id":"m","replayed":false}\n\n');
    await vi.advanceTimersByTimeAsync(34_000);
    let done = false;
    void settled.then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1_500);
    const err = await settled;
    expect(err).toBeInstanceOf(ChatStreamError);
    expect((err as ChatStreamError).reason).toBe("watchdog");
  });

  it("heartbeat-only chunks keep the connection alive", async () => {
    vi.useFakeTimers();
    const s = controlledStream();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(s.body, { status: 200 }));
    const p = collect(streamChatQuery(REQ, new AbortController().signal, { fetchImpl }));
    const settled = p.then((v) => v, (e) => e as Error);
    s.push('event: meta\ndata: {"v":1,"request_id":"r","session_id":"s","message_id":"m","replayed":false}\n\n');
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(15_000); // server pings every 15 s
      s.push(": ping\n\n");
    }
    s.push('event: done\ndata: {"v":1,"finish_reason":"stop"}\n\n');
    s.close();
    const events = (await settled) as ChatEvent[];
    expect(events.map((e) => e.type)).toEqual(["meta", "done"]);
  });

  it("covers the wait for response headers too", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockImplementation((_u: string, init: RequestInit) => new Promise((_res, rej) => {
      init.signal!.addEventListener("abort", () => rej(new DOMException("Aborted", "AbortError")));
    }));
    const settled = collect(streamChatQuery(REQ, new AbortController().signal, { fetchImpl })).then(() => "ok", (e) => e as Error);
    await vi.advanceTimersByTimeAsync(36_000);
    expect(((await settled) as ChatStreamError).reason).toBe("watchdog");
  });
});
