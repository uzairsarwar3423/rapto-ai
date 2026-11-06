import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MockUpstream, GOOD_USER, sseHeaders } from "./mockUpstream";
import { POST as queryPOST } from "@/app/api/ai/chat/query/route";
import { GET as sessionsGET } from "@/app/api/ai/chat/sessions/route";
import { PATCH as sessionPATCH, DELETE as sessionDELETE } from "@/app/api/ai/chat/sessions/[id]/route";
import { GET as messagesGET } from "@/app/api/ai/chat/sessions/[id]/messages/route";
import { POST as feedbackPOST } from "@/app/api/ai/chat/messages/[id]/feedback/route";
import { GET as suggestionsGET } from "@/app/api/ai/chat/suggestions/route";
import { __resetIdentityCache } from "@/lib/ai/identity";
import { loadGolden, encodeEvent } from "../harness/transcripts";

const mock = new MockUpstream();
const CMID = "22222222-2222-4222-8222-222222222222";
const BASE = "http://localhost:3000";

beforeAll(async () => {
  await mock.start();
  process.env.API_URL = mock.baseUrl;
  process.env.AI_CHAT_URL = mock.baseUrl;
  process.env.INTERNAL_JWT_PRIVATE_KEY = mock.privateKeyPem;
  process.env.INTERNAL_JWT_KID = "test-kid-1";
});
afterAll(async () => {
  await mock.stop();
});
beforeEach(() => {
  mock.reset();
  mock.users.clear();
  mock.users.set("tok-good", GOOD_USER);
  __resetIdentityCache();
});

function req(path: string, init: RequestInit & { token?: string | null; same?: boolean } = {}): Request {
  const { token = "tok-good", same = true, headers, ...rest } = init;
  const h = new Headers(headers);
  if (token) h.set("authorization", `Bearer ${token}`);
  if (same && rest.method && rest.method !== "GET") h.set("sec-fetch-site", "same-origin");
  return new Request(`${BASE}${path}`, { ...rest, headers: h });
}
const jsonPost = (path: string, body: unknown, init: Parameters<typeof req>[1] = {}) =>
  req(path, { method: "POST", ...init, headers: { "content-type": "application/json", ...(init.headers as object) }, body: JSON.stringify(body) });
const validBody = (over: Record<string, unknown> = {}) => ({ message: "What did Ahmed commit to?", client_message_id: CMID, ...over });
const errOf = async (res: Response) => ((await res.json()) as { error: Record<string, unknown> }).error;

function streamGolden(name: string) {
  mock.chatHandler = (_req, res) => {
    res.writeHead(200, sseHeaders());
    for (const e of loadGolden(name)) res.write(encodeEvent(e));
    res.end();
  };
}

describe("authentication and identity", () => {
  it("401 without a session", async () => {
    const res = await queryPOST(jsonPost("/api/ai/chat/query", validBody(), { token: null, headers: { "sec-fetch-site": "same-origin" } }));
    expect(res.status).toBe(401);
    expect((await errOf(res)).code).toBe("UNAUTHENTICATED");
    expect(mock.chatCalls).toHaveLength(0);
  });

  it("401 when Express rejects the access token", async () => {
    const res = await sessionsGET(req("/api/ai/chat/sessions", { token: "tok-expired" }));
    expect(res.status).toBe(401);
    expect(mock.chatCalls).toHaveLength(0);
  });

  it("accepts the readable access-token cookie as well as the Authorization header", async () => {
    mock.chatHandler = (_r, res) => void res.writeHead(200, { "content-type": "application/json" }).end('{"items":[],"next_cursor":null}');
    const res = await sessionsGET(req("/api/ai/chat/sessions", { token: null, headers: { cookie: "x=1; rapto_access=tok-good; y=2" } }));
    expect(res.status).toBe(200);
  });

  it("403 for a user with no team", async () => {
    mock.users.set("tok-noteam", { ...GOOD_USER, teamId: null, team: null });
    const res = await sessionsGET(req("/api/ai/chat/sessions", { token: "tok-noteam" }));
    expect(res.status).toBe(403);
    expect(mock.chatCalls).toHaveLength(0);
  });

  it("503 (not 401) when Express itself is down", async () => {
    mock.users.set("tok-down", "down");
    const res = await sessionsGET(req("/api/ai/chat/sessions", { token: "tok-down" }));
    expect(res.status).toBe(503);
  });

  it("caches identity briefly and de-duplicates concurrent resolution", async () => {
    mock.chatHandler = (_r, res) => void res.writeHead(200, { "content-type": "application/json" }).end('{"items":[]}');
    await Promise.all([1, 2, 3, 4].map(() => sessionsGET(req("/api/ai/chat/sessions"))));
    await sessionsGET(req("/api/ai/chat/sessions"));
    expect(mock.meCalls).toBe(1);
  });
});

describe("service JWT", () => {
  it("carries every claim the AI service requires, signed RS256 with kid, ≤ 60 s", async () => {
    streamGolden("happy");
    const res = await queryPOST(jsonPost("/api/ai/chat/query", validBody()));
    expect(res.status).toBe(200);
    await res.text();
    const { header, claims } = mock.verifyToken(mock.chatCalls[0].headers.authorization);
    expect(header).toMatchObject({ alg: "RS256", kid: "test-kid-1" });
    expect(claims).toMatchObject({
      iss: "vocaply-bff", aud: "vocaply-ai-chat", team_id: "team_1", user_id: "user_1", role: "MEMBER", tz: "Asia/Karachi",
    });
    expect(typeof claims.rid).toBe("string");
    expect((claims.exp as number) - (claims.iat as number)).toBeLessThanOrEqual(60);
    expect((claims.exp as number) - (claims.iat as number)).toBeGreaterThan(0);
    expect(claims.jti).toBeTruthy();
  });

  it("maps Express plans explicitly (GROWTH → PRO) so teams never silently get business limits", async () => {
    streamGolden("happy");
    await (await queryPOST(jsonPost("/api/ai/chat/query", validBody()))).text();
    expect(mock.verifyToken(mock.chatCalls[0].headers.authorization).claims.plan).toBe("PRO");
  });

  it("ignores a hostile team_id/user_id in the body: the token and upstream body carry the session's identity", async () => {
    streamGolden("happy");
    const res = await queryPOST(jsonPost("/api/ai/chat/query", validBody({ team_id: "team_EVIL", user_id: "user_EVIL", role: "OWNER", plan: "ENTERPRISE" })));
    await res.text();
    const call = mock.chatCalls[0];
    expect(mock.verifyToken(call.headers.authorization).claims).toMatchObject({ team_id: "team_1", user_id: "user_1", role: "MEMBER" });
    const forwarded = JSON.parse(call.body);
    for (const k of ["team_id", "user_id", "role", "plan"]) expect(forwarded).not.toHaveProperty(k);
    expect(Object.keys(forwarded).sort()).toEqual(["client_message_id", "filters", "message", "session_id"]);
  });

  it("falls back to 503 when the signing key is not configured (never an unsigned call)", async () => {
    const saved = process.env.INTERNAL_JWT_PRIVATE_KEY;
    process.env.INTERNAL_JWT_PRIVATE_KEY = "";
    try {
      const res = await sessionsGET(req("/api/ai/chat/sessions"));
      expect(res.status).toBe(503);
      expect(mock.chatCalls).toHaveLength(0);
    } finally {
      process.env.INTERNAL_JWT_PRIVATE_KEY = saved;
    }
  });
});

describe("CSRF / content type / validation", () => {
  const cases: Array<[string, Record<string, string>]> = [
    ["cross-site fetch metadata", { "sec-fetch-site": "cross-site" }],
    ["same-site (sibling subdomain) fetch metadata", { "sec-fetch-site": "same-site" }],
  ];
  for (const [name, headers] of cases) {
    it(`rejects a mutating request with ${name}`, async () => {
      const res = await queryPOST(jsonPost("/api/ai/chat/query", validBody(), { same: false, headers }));
      expect(res.status).toBe(403);
      expect((await errOf(res)).code).toBe("BAD_ORIGIN");
      expect(mock.chatCalls).toHaveLength(0);
    });
  }

  it("rejects a mismatched Origin header when fetch metadata is absent", async () => {
    const res = await queryPOST(jsonPost("/api/ai/chat/query", validBody(), { same: false, headers: { origin: "https://evil.example" } }));
    expect(res.status).toBe(403);
  });

  it("rejects a cookie-only mutating request with no origin signal at all", async () => {
    const res = await queryPOST(jsonPost("/api/ai/chat/query", validBody(), { token: null, same: false, headers: { cookie: "rapto_access=tok-good" } }));
    expect(res.status).toBe(403);
  });

  it("accepts a matching Origin header", async () => {
    streamGolden("chitchat");
    const res = await queryPOST(jsonPost("/api/ai/chat/query", validBody(), { same: false, headers: { origin: BASE } }));
    expect(res.status).toBe(200);
    await res.text();
  });

  it("415 for a non-JSON content type (text/plain is the classic CSRF vehicle)", async () => {
    const res = await queryPOST(req("/api/ai/chat/query", { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify(validBody()) }));
    expect(res.status).toBe(415);
  });

  it("422 with a field-level reason for a missing client_message_id", async () => {
    const res = await queryPOST(jsonPost("/api/ai/chat/query", { message: "hi" }));
    expect(res.status).toBe(422);
    expect(await errOf(res)).toMatchObject({ code: "INVALID_INPUT", field: "client_message_id" });
  });

  it("422 when the message exceeds 2,000 code points (emoji count once, not twice)", async () => {
    expect((await queryPOST(jsonPost("/api/ai/chat/query", validBody({ message: "x".repeat(2001) })))).status).toBe(422);
    streamGolden("chitchat");
    const ok = await queryPOST(jsonPost("/api/ai/chat/query", validBody({ message: "😀".repeat(2000) })));
    expect(ok.status).toBe(200);
    await ok.text();
  });

  it("422 for malformed JSON and 413 for an oversized body", async () => {
    const bad = await queryPOST(req("/api/ai/chat/query", { method: "POST", headers: { "content-type": "application/json" }, body: "{nope" }));
    expect(bad.status).toBe(422);
    const big = await queryPOST(jsonPost("/api/ai/chat/query", validBody({ message: "hi", pad: "x".repeat(40_000) })));
    expect(big.status).toBe(413);
    expect(mock.chatCalls).toHaveLength(0);
  });

  it("rejects bad filters (inverted dates, over-long id list, bad id)", async () => {
    const f = (filters: unknown) => queryPOST(jsonPost("/api/ai/chat/query", validBody({ filters })));
    expect((await f({ date_from: "2026-02-01", date_to: "2026-01-01" })).status).toBe(422);
    expect((await f({ meeting_ids: Array.from({ length: 51 }, (_, i) => `m${i}`) })).status).toBe(422);
    expect((await f({ meeting_ids: ["../etc"] })).status).toBe(422);
    expect((await f({ date_from: "2026-13-45" })).status).toBe(422);
    expect(mock.chatCalls).toHaveLength(0);
  });

  it("rejects mutating non-stream routes from a foreign origin", async () => {
    const del = await sessionDELETE(req("/api/ai/chat/sessions/abc", { method: "DELETE", same: false, headers: { "sec-fetch-site": "cross-site" } }), { params: Promise.resolve({ id: "abc" }) });
    expect(del.status).toBe(403);
    const fb = await feedbackPOST(jsonPost("/api/ai/chat/messages/abc/feedback", { rating: "up" }, { same: false, headers: { "sec-fetch-site": "cross-site" } }), { params: Promise.resolve({ id: "abc" }) });
    expect(fb.status).toBe(403);
    expect(mock.chatCalls).toHaveLength(0);
  });
});

describe("streaming proxy", () => {
  it("sets non-buffering headers and returns the upstream events byte-for-byte", async () => {
    streamGolden("happy");
    const res = await queryPOST(jsonPost("/api/ai/chat/query", validBody()));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/event-stream/);
    expect(res.headers.get("cache-control")).toContain("no-transform");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    expect(res.headers.get("content-encoding")).toBe("identity");
    expect(res.headers.get("x-request-id")).toBeTruthy();
    const text = await res.text();
    expect(text).toBe(loadGolden("happy").map(encodeEvent).join(""));
  });

  it("delivers chunks incrementally — the first event arrives while the upstream is still mid-answer", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    mock.chatHandler = async (_req, res) => {
      res.writeHead(200, sseHeaders());
      res.write(encodeEvent(loadGolden("happy")[0]));
      await gate; // the upstream is "thinking": nothing more is sent until the test releases it
      res.write(encodeEvent({ event: "done", data: { v: 1, finish_reason: "stop" } }));
      res.end();
    };
    const res = await queryPOST(jsonPost("/api/ai/chat/query", validBody()));
    const reader = res.body!.getReader();
    const first = await Promise.race([reader.read(), new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 3000))]);
    expect(first).not.toBe("timeout"); // would be "timeout" if the BFF buffered the response
    expect(new TextDecoder().decode((first as ReadableStreamReadResult<Uint8Array>).value)).toContain("event: meta");
    release();
    let rest = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      rest += new TextDecoder().decode(value);
    }
    expect(rest).toContain("event: done");
  });

  async function upstreamClosed(started: Promise<void>, closed: Promise<void>) {
    await started;
    return Promise.race([closed.then(() => "closed"), new Promise((r) => setTimeout(() => r("still-open"), 3000))]);
  }
  function hangingUpstream() {
    let onStart!: () => void;
    let onClose!: () => void;
    const started = new Promise<void>((r) => (onStart = r));
    const closed = new Promise<void>((r) => (onClose = r));
    mock.chatHandler = (_req, res) => {
      res.writeHead(200, sseHeaders());
      res.write(encodeEvent(loadGolden("happy")[0]));
      res.on("close", () => {
        if (!res.writableEnded) onClose();
      });
      onStart();
    };
    return { started, closed };
  }

  it("abort path 1: aborting the incoming request aborts the upstream request", async () => {
    const { started, closed } = hangingUpstream();
    const ac = new AbortController();
    const res = await queryPOST(jsonPost("/api/ai/chat/query", validBody(), { signal: ac.signal }));
    const reader = res.body!.getReader();
    await reader.read();
    ac.abort();
    expect(await upstreamClosed(started, closed)).toBe("closed");
    await reader.cancel().catch(() => undefined);
  });

  it("abort path 2: the client cancelling the response body aborts the upstream request", async () => {
    const { started, closed } = hangingUpstream();
    const res = await queryPOST(jsonPost("/api/ai/chat/query", validBody()));
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel(); // what the runtime does when the browser disconnects / presses Stop
    expect(await upstreamClosed(started, closed)).toBe("closed");
  });

  it("a mid-stream upstream failure errors the response (so the browser retries) instead of ending cleanly", async () => {
    mock.chatHandler = (_req, res) => {
      res.writeHead(200, sseHeaders());
      res.write(encodeEvent(loadGolden("happy")[0]));
      setTimeout(() => res.socket?.destroy(), 20);
    };
    const res = await queryPOST(jsonPost("/api/ai/chat/query", validBody()));
    await expect(res.text()).rejects.toThrow();
  });
});

describe("pre-stream error normalisation (no upstream internals ever leak)", () => {
  const upstream = (status: number, body: string, headers: Record<string, string> = { "content-type": "application/json" }) => {
    mock.chatHandler = (_req, res) => void res.writeHead(status, headers).end(body);
  };
  const ask = () => queryPOST(jsonPost("/api/ai/chat/query", validBody()));

  it("forwards 429 QUOTA_EXCEEDED with Retry-After", async () => {
    upstream(429, JSON.stringify({ error: { code: "QUOTA_EXCEEDED", message: "Daily limit reached.", retryable: false, retry_after_s: 3600 } }), {
      "content-type": "application/json", "retry-after": "3600",
    });
    const res = await ask();
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("3600");
    expect(await errOf(res)).toMatchObject({ code: "QUOTA_EXCEEDED", retry_after_s: 3600 });
  });

  it("maps an upstream 401 (our service JWT rejected) to 503 — never a user sign-out", async () => {
    upstream(401, JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "Authentication required.", retryable: false } }));
    const res = await ask();
    expect(res.status).toBe(503);
    expect((await errOf(res)).code).toBe("SERVICE_UNAVAILABLE");
  });

  it("keeps 409 DUPLICATE_IN_FLIGHT with the active request_id", async () => {
    upstream(409, JSON.stringify({ error: { code: "DUPLICATE_IN_FLIGHT", message: "This message is already being answered.", retryable: false, request_id: "req-active" } }));
    const res = await ask();
    expect(res.status).toBe(409);
    expect(await errOf(res)).toMatchObject({ code: "DUPLICATE_IN_FLIGHT", request_id: "req-active" });
  });

  it("surfaces the field-level 422 reason", async () => {
    upstream(422, JSON.stringify({ error: { code: "INVALID_INPUT", message: "message is too long for the assistant; please shorten it", retryable: false, field: "message" } }));
    const res = await ask();
    expect(res.status).toBe(422);
    expect(await errOf(res)).toMatchObject({ field: "message", message: expect.stringContaining("shorten") });
  });

  it("converts FastAPI's native 422 shape", async () => {
    upstream(422, JSON.stringify({ detail: [{ loc: ["body", "message"], msg: "String should have at most 2000 characters", type: "string_too_long" }] }));
    const res = await ask();
    expect(res.status).toBe(422);
    expect(await errOf(res)).toMatchObject({ code: "INVALID_INPUT", field: "message" });
  });

  it("replaces an HTML error page with a generic 503", async () => {
    upstream(502, "<html><body>nginx 502 Bad Gateway at 10.0.3.7</body></html>", { "content-type": "text/html" });
    const res = await ask();
    expect(res.status).toBe(503);
    const body = JSON.stringify(await errOf(res));
    expect(body).not.toContain("nginx");
    expect(body).not.toContain("10.0.3.7");
  });

  it("does not leak a stack trace from a JSON 500", async () => {
    upstream(500, JSON.stringify({ detail: "Traceback (most recent call last): File \"/app/secret.py\"" }));
    const res = await ask();
    expect(res.status).toBe(503);
    expect(JSON.stringify(await errOf(res))).not.toContain("Traceback");
  });

  it("drops unknown codes to a status-derived code and never echoes unknown fields", async () => {
    upstream(429, JSON.stringify({ error: { code: "SOME_NEW_CODE", message: "custom <b>html</b>", retryable: true, internal_debug: "db-host-7" } }));
    const res = await ask();
    const e = await errOf(res);
    expect(e.code).toBe("RATE_LIMITED");
    expect(JSON.stringify(e)).not.toContain("db-host-7");
    expect(JSON.stringify(e)).not.toContain("<b>");
  });

  it("503 when the AI service is unreachable", async () => {
    const saved = process.env.AI_CHAT_URL;
    process.env.AI_CHAT_URL = "http://127.0.0.1:1";
    try {
      const res = await ask();
      expect(res.status).toBe(503);
      expect((await errOf(res)).retryable).toBe(true);
    } finally {
      process.env.AI_CHAT_URL = saved;
    }
  });

  it("503 when /chat/query answers 200 but not with an event stream", async () => {
    upstream(200, "{}", { "content-type": "application/json" });
    expect((await ask()).status).toBe(503);
  });

  it("every error response is private/no-store and carries a request id", async () => {
    upstream(404, JSON.stringify({ error: { code: "NOT_FOUND", message: "Not found.", retryable: false } }));
    const res = await ask();
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect((await errOf(res)).request_id).toBe(res.headers.get("x-request-id"));
  });
});

describe("session, message, feedback and suggestion routes", () => {
  const jsonUp = (body: unknown, status = 200) => {
    mock.chatHandler = (_r, res) => void res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
  };
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it("lists sessions, clamps limit and passes a valid cursor", async () => {
    jsonUp({ items: [{ id: "s1", title: "T", message_count: 2, created_at: "2026-11-06T10:00:00Z", updated_at: "2026-11-06T10:05:00Z" }], next_cursor: "abc.def" });
    const res = await sessionsGET(req("/api/ai/chat/sessions?limit=500&cursor=abc.def"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(mock.chatCalls[0].url).toBe("/chat/sessions?limit=50&cursor=abc.def");
    expect(((await res.json()) as { items: unknown[] }).items).toHaveLength(1);
  });

  it("rejects malformed cursors and limits before any upstream call", async () => {
    expect((await sessionsGET(req("/api/ai/chat/sessions?cursor=../../etc/passwd"))).status).toBe(422);
    expect((await sessionsGET(req("/api/ai/chat/sessions?cursor=" + "a".repeat(600)))).status).toBe(422);
    expect((await sessionsGET(req("/api/ai/chat/sessions?limit=abc"))).status).toBe(422);
    expect(mock.chatCalls).toHaveLength(0);
  });

  it("rejects traversal-style session ids before any upstream call", async () => {
    for (const id of ["../admin", "a/b", "a%2Fb", "..%2F..", "x".repeat(65), "a b", "a?b=c", ""]) {
      const res = await messagesGET(req("/api/ai/chat/sessions/x/messages"), ctx(id));
      expect(res.status, id).toBe(404);
    }
    expect((await sessionDELETE(req("/api/ai/chat/sessions/x", { method: "DELETE" }), ctx("../x"))).status).toBe(404);
    expect(mock.chatCalls).toHaveLength(0);
  });

  it("proxies messages with the chronological contract intact and a bounded limit", async () => {
    jsonUp({
      items: [{ id: "m1", role: "user", content: "hi", status: "accepted", created_at: "2026-11-06T10:00:00Z", sources: [] }],
      next_cursor: null,
    });
    const res = await messagesGET(req("/api/ai/chat/sessions/s1/messages?limit=10"), ctx("s1"));
    expect(res.status).toBe(200);
    expect(mock.chatCalls[0].url).toBe("/chat/sessions/s1/messages?limit=10");
  });

  it("drops unexpected fields from upstream responses (response schema is a whitelist)", async () => {
    jsonUp({ items: [{ id: "s1", title: "T", created_at: "a", updated_at: "b", mongo_internal: "secret", team_id: "team_9" }] });
    const body = (await (await sessionsGET(req("/api/ai/chat/sessions"))).json()) as { items: Array<Record<string, unknown>> };
    expect(body.items[0]).not.toHaveProperty("mongo_internal");
    expect(body.items[0]).not.toHaveProperty("team_id");
  });

  it("turns a malformed upstream body into a 503 rather than forwarding it", async () => {
    jsonUp({ items: "not-an-array" });
    expect((await sessionsGET(req("/api/ai/chat/sessions"))).status).toBe(503);
  });

  it("a foreign session id is an upstream 404, surfaced as a plain 404", async () => {
    jsonUp({ error: { code: "NOT_FOUND", message: "Not found.", retryable: false } }, 404);
    const res = await messagesGET(req("/api/ai/chat/sessions/x/messages"), ctx("foreign"));
    expect(res.status).toBe(404);
    expect((await errOf(res)).code).toBe("NOT_FOUND");
  });

  it("renames with validation (trimmed, 1–120 chars)", async () => {
    jsonUp({ id: "s1", title: "New", message_count: 1, created_at: "a", updated_at: "b" });
    const ok = await sessionPATCH(jsonPost("/api/ai/chat/sessions/s1", { title: "  New  " }, { method: "PATCH" }), ctx("s1"));
    expect(ok.status).toBe(200);
    expect(JSON.parse(mock.chatCalls[0].body)).toEqual({ title: "New" });
    expect(mock.chatCalls[0].method).toBe("PATCH");
    const empty = await sessionPATCH(jsonPost("/api/ai/chat/sessions/s1", { title: "   " }, { method: "PATCH" }), ctx("s1"));
    expect(empty.status).toBe(422);
    const long = await sessionPATCH(jsonPost("/api/ai/chat/sessions/s1", { title: "x".repeat(121) }, { method: "PATCH" }), ctx("s1"));
    expect(long.status).toBe(422);
  });

  it("deletes (204) and posts feedback (204) through the same guards", async () => {
    mock.chatHandler = (_r, res) => void res.writeHead(204).end();
    expect((await sessionDELETE(req("/api/ai/chat/sessions/s1", { method: "DELETE" }), ctx("s1"))).status).toBe(204);
    const fb = await feedbackPOST(jsonPost("/api/ai/chat/messages/m1/feedback", { rating: "down", reason: "inaccurate", comment: "wrong date" }), ctx("m1"));
    expect(fb.status).toBe(204);
    expect(JSON.parse(mock.chatCalls[1].body)).toEqual({ rating: "down", reason: "inaccurate", comment: "wrong date" });
    expect((await feedbackPOST(jsonPost("/api/ai/chat/messages/m1/feedback", { rating: "meh" }), ctx("m1"))).status).toBe(422);
    expect((await feedbackPOST(jsonPost("/api/ai/chat/messages/m1/feedback", { rating: "up", comment: "x".repeat(1001) }), ctx("m1"))).status).toBe(422);
  });

  it("serves suggestions", async () => {
    jsonUp({ items: ["What did we decide this week?"] });
    const res = await suggestionsGET(req("/api/ai/chat/suggestions"));
    expect(await res.json()).toEqual({ items: ["What did we decide this week?"] });
  });
});
