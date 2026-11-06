/**
 * Test harness: golden SSE transcripts from the backend, re-encoded exactly as `encode_event` does on the wire
 * (compact JSON, UTF-8, `event:`/`data:` lines, blank-line terminator), plus helpers to chunk the bytes arbitrarily.
 */
import fs from "node:fs";
import path from "node:path";

export interface GoldenEvent {
  event: string;
  data: Record<string, unknown>;
}

const GOLDEN_DIR = path.resolve(__dirname, "../../../services/ai-pipeline/tests/fixtures/golden_sse_transcripts");
const encoder = new TextEncoder();

export function goldenNames(): string[] {
  return fs
    .readdirSync(GOLDEN_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

export function loadGolden(name: string): GoldenEvent[] {
  return JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, `${name}.json`), "utf8")) as GoldenEvent[];
}

export function encodeEvent(e: GoldenEvent): string {
  return `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`;
}

export function encodeTranscript(events: GoldenEvent[], opts: { eol?: "\n" | "\r\n" | "\r"; bom?: boolean; heartbeats?: boolean } = {}): Uint8Array {
  const eol = opts.eol ?? "\n";
  let text = events
    .map((e) => (opts.heartbeats ? ": ping\n\n" : "") + encodeEvent(e))
    .join("");
  if (eol !== "\n") text = text.replace(/\n/g, eol);
  if (opts.bom) text = "﻿" + text;
  return encoder.encode(text);
}

export function loadGoldenBytes(name: string, opts?: Parameters<typeof encodeTranscript>[1]): Uint8Array {
  return encodeTranscript(loadGolden(name), opts);
}

/** Split bytes at the given offsets (sorted, unique, inside the range). */
export function splitAt(bytes: Uint8Array, offsets: number[]): Uint8Array[] {
  const cuts = [...new Set(offsets)].filter((o) => o > 0 && o < bytes.length).sort((a, b) => a - b);
  const out: Uint8Array[] = [];
  let prev = 0;
  for (const c of cuts) {
    out.push(bytes.slice(prev, c));
    prev = c;
  }
  out.push(bytes.slice(prev));
  return out;
}

/** Deterministic PRNG so fuzz failures are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomChunks(bytes: Uint8Array, seed: number, maxSize = 17): Uint8Array[] {
  const rnd = mulberry32(seed);
  const out: Uint8Array[] = [];
  let i = 0;
  while (i < bytes.length) {
    const n = 1 + Math.floor(rnd() * maxSize);
    out.push(bytes.slice(i, i + n));
    i += n;
  }
  return out;
}

export function streamOf(chunks: Uint8Array[], opts: { onCancel?: () => void } = {}): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]);
      else controller.close();
    },
    cancel() {
      opts.onCancel?.();
    },
  });
}

/** A transcript whose answer text carries Urdu script and emoji (multi-byte UTF-8 everywhere). */
export function multibyteTranscript(): GoldenEvent[] {
  const base = loadGolden("happy");
  return base.map((e) => {
    if (e.event !== "token") return e;
    return { ...e, data: { ...e.data, t: `احمد جمعہ تک billing بھیجے گا 🚀👍🏽 ${String(e.data.t)}` } };
  });
}
