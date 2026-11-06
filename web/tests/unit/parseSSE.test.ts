import { describe, expect, it } from "vitest";
import { SSEParser, readChatEvents } from "@/lib/sse/parseSSE";
import { ProtocolError, ProtocolVersionError } from "@/lib/contracts/chat";
import { streamOf } from "../harness/transcripts";

const enc = new TextEncoder();
const parseAll = (text: string) => new SSEParser().feedText(text);

async function drain(body: ReadableStream<Uint8Array>) {
  const out = [];
  for await (const e of readChatEvents(body)) out.push(e);
  return out;
}

describe("SSEParser", () => {
  it("parses several events delivered in one chunk", () => {
    const frames = parseAll('event: token\ndata: {"a":1}\n\nevent: done\ndata: {"b":2}\n\n');
    expect(frames.map((f) => f.event)).toEqual(["token", "done"]);
  });

  it("handles CRLF, LF and lone CR terminators", () => {
    // A trailing lone CR is held back (it might start a CRLF), so end the CR case with a following LF-free sentinel.
    expect(parseAll("event: token\r\ndata: x\r\n\r\n")).toEqual([{ event: "token", data: "x" }]);
    expect(parseAll("event: token\ndata: x\n\n")).toEqual([{ event: "token", data: "x" }]);
    expect(parseAll("event: token\rdata: x\r\rid: 1\r")).toEqual([{ event: "token", data: "x" }]);
  });

  it("waits on a trailing CR so a split CRLF is not read as two terminators", () => {
    const p = new SSEParser();
    const a = p.feedText("event: token\r\ndata: x\r");
    const b = p.feedText("\n\r\n");
    expect([...a, ...b]).toEqual([{ event: "token", data: "x" }]);
  });

  it("strips a single leading BOM only at stream start", () => {
    expect(parseAll("﻿event: a\ndata: 1\n\n")).toEqual([{ event: "a", data: "1" }]);
    const p = new SSEParser();
    p.feedText("event: a\ndata: 1\n\n");
    // A BOM mid-stream is part of the field name, so the field is unknown and the event has no data: ignored.
    expect(p.feedText("﻿event: b\ndata: 2\n\n")).toEqual([{ event: "message", data: "2" }]);
  });

  it("ignores comment/heartbeat lines but does not dispatch on them", () => {
    expect(parseAll(": ping\n\n: ping\n\n")).toEqual([]);
  });

  it("joins multi-line data with newline", () => {
    expect(parseAll("event: x\ndata: a\ndata: b\n\n")).toEqual([{ event: "x", data: "a\nb" }]);
  });

  it("defaults the event name to message and honours id/retry", () => {
    expect(parseAll("id: 7\nretry: 1500\ndata: hi\n\n")).toEqual([{ event: "message", data: "hi", id: "7", retry: 1500 }]);
  });

  it("strips exactly one space after the colon and allows a field with no colon", () => {
    expect(parseAll("data:  two\n\n")).toEqual([{ event: "message", data: " two" }]);
    expect(parseAll("data\n\n")).toEqual([{ event: "message", data: "" }]);
  });

  it("ignores unknown fields", () => {
    expect(parseAll("foo: bar\nevent: a\ndata: 1\n\n")).toEqual([{ event: "a", data: "1" }]);
  });

  it("discards an incomplete trailing event at end of stream", () => {
    const p = new SSEParser();
    expect(p.feedText("event: a\ndata: 1\n")).toEqual([]);
    p.end();
  });

  it("rejects an event larger than the size guard (data lines)", () => {
    const p = new SSEParser({ maxEventBytes: 64 });
    expect(() => p.feedText(`data: ${"x".repeat(200)}\n`)).toThrow(ProtocolError);
  });

  it("rejects an unterminated tail larger than the size guard", () => {
    const p = new SSEParser({ maxEventBytes: 64 });
    expect(() => p.feedText("x".repeat(200))).toThrow(/maximum size/);
  });

  it("decodes multi-byte characters split across chunks without corruption", () => {
    const bytes = enc.encode('event: token\ndata: {"v":1,"t":"احمد 🚀"}\n\n');
    for (let cut = 1; cut < bytes.length; cut++) {
      const p = new SSEParser();
      const frames = [...p.feed(bytes.slice(0, cut)), ...p.feed(bytes.slice(cut))];
      expect(frames, `cut at ${cut}`).toHaveLength(1);
      expect(JSON.parse(frames[0].data).t).toBe("احمد 🚀");
    }
  });
});

describe("readChatEvents", () => {
  const frame = (event: string, data: unknown) => enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  it("yields validated events and skips unknown event names", async () => {
    const body = streamOf([frame("token", { v: 1, t: "hi" }), frame("future_event", { v: 1, x: 1 }), frame("done", { v: 1, finish_reason: "stop" })]);
    expect((await drain(body)).map((e) => e.type)).toEqual(["token", "done"]);
  });

  it("ignores unknown fields on known events", async () => {
    const out = await drain(streamOf([frame("token", { v: 1, t: "hi", brand_new: true })]));
    expect(out).toHaveLength(1);
    expect(out[0]).not.toHaveProperty("brand_new");
  });

  it("turns invalid JSON into a ProtocolError (never swallowed)", async () => {
    await expect(drain(streamOf([enc.encode("event: token\ndata: {not json\n\n")]))).rejects.toMatchObject({ reason: "bad_json" });
  });

  it("turns a schema failure into a ProtocolError", async () => {
    await expect(drain(streamOf([frame("token", { v: 1 })]))).rejects.toMatchObject({ reason: "bad_schema" });
  });

  it("raises ProtocolVersionError for a newer protocol version", async () => {
    await expect(drain(streamOf([frame("token", { v: 2, t: "x" })]))).rejects.toBeInstanceOf(ProtocolVersionError);
  });

  it("reports activity for heartbeat-only chunks", async () => {
    let activity = 0;
    const body = streamOf([enc.encode(": ping\n\n"), enc.encode(": ping\n\n"), frame("done", { v: 1, finish_reason: "stop" })]);
    for await (const e of readChatEvents(body, { onActivity: () => activity++ })) void e;
    expect(activity).toBe(3);
  });

  it("cancels the body when the consumer stops early (so the BFF can abort upstream)", async () => {
    let cancelled = false;
    const body = streamOf(
      [frame("token", { v: 1, t: "a" }), frame("token", { v: 1, t: "b" }), frame("done", { v: 1, finish_reason: "stop" })],
      { onCancel: () => { cancelled = true; } },
    );
    for await (const e of readChatEvents(body)) {
      void e;
      break;
    }
    expect(cancelled).toBe(true);
  });

  it("cancels the body when the abort signal fires", async () => {
    const ac = new AbortController();
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(frame("token", { v: 1, t: "a" }));
      },
      cancel() {
        cancelled = true;
      },
    });
    const it = readChatEvents(body, { signal: ac.signal });
    await it.next();
    ac.abort();
    await it.return(undefined);
    expect(cancelled).toBe(true);
  });
});
