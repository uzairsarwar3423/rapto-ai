import { describe, expect, it } from "vitest";
import { readChatEvents } from "@/lib/sse/parseSSE";
import type { ChatEvent } from "@/lib/contracts/chat";
import { decodeEvent, ProtocolError, ProtocolVersionError } from "@/lib/contracts/chat";
import {
  encodeTranscript, goldenNames, loadGolden, loadGoldenBytes, multibyteTranscript, randomChunks, splitAt, streamOf,
} from "../harness/transcripts";

async function collect(chunks: Uint8Array[]): Promise<ChatEvent[]> {
  const out: ChatEvent[] = [];
  for await (const e of readChatEvents(streamOf(chunks))) out.push(e);
  return out;
}

const names = goldenNames();

describe("golden transcripts (Day 58 contract)", () => {
  it("finds the backend fixtures", () => {
    expect(names).toEqual(
      expect.arrayContaining(["happy", "no_results", "cancelled", "error", "replay", "analytics", "filtered_canary", "mid_stream_error", "chitchat"]),
    );
  });

  for (const name of names) {
    describe(name, () => {
      const golden = loadGolden(name);
      const expectedTypes = golden.map((e) => e.event);

      it("validates against the schemas, in order, ending in a terminal event", async () => {
        const events = await collect([loadGoldenBytes(name)]);
        expect(events.map((e) => e.type)).toEqual(expectedTypes);
        expect(["done", "error"]).toContain(events[events.length - 1].type);
        expect(events[0].type).toBe("meta");
      });

      it("parses identically when split at EVERY byte offset", async () => {
        const bytes = loadGoldenBytes(name);
        const whole = await collect([bytes]);
        for (let cut = 1; cut < bytes.length; cut++) {
          expect(await collect(splitAt(bytes, [cut])), `${name} cut=${cut}`).toEqual(whole);
        }
      });

      it("parses identically under seeded random chunking (1..17 bytes)", async () => {
        const bytes = loadGoldenBytes(name);
        const whole = await collect([bytes]);
        for (let seed = 1; seed <= 25; seed++) {
          expect(await collect(randomChunks(bytes, seed)), `seed=${seed}`).toEqual(whole);
        }
      });

      it("parses identically with CRLF, CR, BOM and interleaved heartbeats", async () => {
        const whole = await collect([loadGoldenBytes(name)]);
        for (const opts of [{ eol: "\r\n" as const }, { eol: "\r" as const }, { bom: true }, { heartbeats: true }]) {
          expect(await collect(randomChunks(encodeTranscript(golden, opts), 7)), JSON.stringify(opts)).toEqual(whole);
        }
      });
    });
  }

  it("preserves Urdu script and emoji at every byte offset", async () => {
    const bytes = encodeTranscript(multibyteTranscript());
    const whole = await collect([bytes]);
    const text = (evs: ChatEvent[]) => evs.filter((e) => e.type === "token").map((e) => (e as { t: string }).t).join("");
    expect(text(whole)).toContain("احمد جمعہ تک");
    expect(text(whole)).toContain("🚀👍🏽");
    for (let cut = 1; cut < bytes.length; cut++) {
      expect(text(await collect(splitAt(bytes, [cut]))), `cut=${cut}`).toBe(text(whole));
    }
  });
});

describe("protocol drift detection (ADR-2)", () => {
  it("ignores an unknown event and an extra field (forward compatible)", () => {
    expect(decodeEvent("brand_new", '{"v":1}')).toBeNull();
    expect(decodeEvent("token", '{"v":1,"t":"x","extra":1}')).toMatchObject({ type: "token", t: "x" });
  });

  it("fails loudly on a structurally mutated event", () => {
    expect(() => decodeEvent("token", '{"v":1,"t":5}')).toThrow(ProtocolError);
    expect(() => decodeEvent("meta", '{"v":1,"request_id":"r"}')).toThrow(ProtocolError);
    expect(() => decodeEvent("sources", '{"v":1,"sources":[{"source_id":"bogus","type":"x"}]}')).toThrow(ProtocolError);
  });

  it("surfaces a version bump as ProtocolVersionError", () => {
    expect(() => decodeEvent("token", '{"v":2,"t":"x"}')).toThrow(ProtocolVersionError);
  });

  it("degrades unknown enum values softly instead of failing the stream", () => {
    expect(decodeEvent("done", '{"v":1,"finish_reason":"brand_new"}')).toMatchObject({ finish_reason: "stop" });
    expect(decodeEvent("error", '{"v":1,"code":"WEIRD","message":"m","retryable":true}')).toMatchObject({ code: "INTERNAL", retryable: true });
    expect(decodeEvent("status", '{"v":1,"stage":"thinking"}')).toMatchObject({ stage: "unknown" });
  });
});
