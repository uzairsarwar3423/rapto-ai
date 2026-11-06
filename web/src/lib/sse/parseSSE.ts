/**
 * sse/parseSSE.ts
 * ───────────────
 * Incremental Server-Sent-Events parser for `fetch` response bodies (EventSource cannot POST).
 *
 *  - Streaming UTF-8 decoding: a multi-byte character (Urdu, emoji) split across network chunks is never corrupted.
 *  - Line endings: CRLF, LF and a lone CR are all terminators; a CR at the very end of a chunk waits for the next
 *    chunk (it may be the first half of CRLF).
 *  - A leading BOM is stripped once, at the start of the stream.
 *  - Comment lines (`: ping` heartbeats) produce no frame but DO count as activity (the watchdog needs them).
 *  - Multi-line `data:` fields are joined with "\n"; `event`, `id`, `retry` are honoured per the SSE spec.
 *  - A single event larger than `maxEventBytes` is a protocol error (resource-exhaustion guard).
 *
 * The parser is transport-agnostic and has no dependency on the chat contract: it yields raw frames. `readChatEvents`
 * adds the contract layer (validation, unknown-event skipping) on top.
 */

import { CHAT_LIMITS, decodeEvent, ProtocolError, type ChatEvent } from "@/lib/contracts/chat";

export interface SSEFrame {
  /** `event:` field, or "message" when absent (per spec). */
  event: string;
  data: string;
  id?: string;
  retry?: number;
}

export interface SSEParserOptions {
  maxEventBytes?: number;
}

export class SSEParser {
  private readonly decoder = new TextDecoder("utf-8", { fatal: false });
  private readonly maxEventBytes: number;
  private buffer = "";
  private started = false;
  private eventName = "";
  private dataLines: string[] = [];
  private dataBytes = 0;
  private lastId: string | undefined;
  private lastRetry: number | undefined;

  constructor(options: SSEParserOptions = {}) {
    this.maxEventBytes = options.maxEventBytes ?? CHAT_LIMITS.maxEventBytes;
  }

  /** Feed raw bytes; returns every frame completed by them (possibly none). */
  feed(chunk: Uint8Array): SSEFrame[] {
    return this.feedText(this.decoder.decode(chunk, { stream: true }));
  }

  /** Feed already-decoded text (used by tests and by `feed`). */
  feedText(text: string): SSEFrame[] {
    if (!this.started && text.length > 0) {
      this.started = true;
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    }
    this.buffer += text;
    const frames: SSEFrame[] = [];

    for (;;) {
      const m = /\r\n|\n|\r/.exec(this.buffer);
      if (!m) break;
      // A lone "\r" at the end of the buffer might be the first half of "\r\n": wait for more bytes.
      if (m[0] === "\r" && m.index === this.buffer.length - 1) break;
      const line = this.buffer.slice(0, m.index);
      this.buffer = this.buffer.slice(m.index + m[0].length);
      const frame = this.processLine(line);
      if (frame) frames.push(frame);
    }

    // The unterminated tail is bounded too (a server that never sends a newline must not grow us without limit).
    if (this.buffer.length + this.dataBytes > this.maxEventBytes) {
      throw new ProtocolError("SSE event exceeds the maximum size", "event_too_large");
    }
    return frames;
  }

  /**
   * Call once at end of stream. A trailing CR that was held back (it might have started a CRLF) can no longer do so,
   * so it terminates its line now; any frame that completes is returned. An incomplete trailing event is then
   * discarded, as the SSE spec requires.
   */
  end(): SSEFrame[] {
    this.decoder.decode(); // flush the decoder; a dangling partial character is dropped
    // "\r" + "\n" is ONE terminator, so this completes the held-back CR without double-counting.
    const frames = this.buffer.endsWith("\r") ? this.feedText("\n") : [];
    this.buffer = "";
    this.dataLines = [];
    this.dataBytes = 0;
    this.eventName = "";
    return frames;
  }

  private processLine(line: string): SSEFrame | null {
    if (line === "") return this.dispatch();
    if (line.charCodeAt(0) === 0x3a /* ":" */) return null; // comment / heartbeat

    const colon = line.indexOf(":");
    let field: string;
    let value: string;
    if (colon === -1) {
      field = line;
      value = "";
    } else {
      field = line.slice(0, colon);
      value = line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
    }

    switch (field) {
      case "event":
        this.eventName = value;
        break;
      case "data":
        this.dataLines.push(value);
        this.dataBytes += value.length + 1;
        if (this.dataBytes > this.maxEventBytes) {
          throw new ProtocolError("SSE event exceeds the maximum size", "event_too_large");
        }
        break;
      case "id":
        if (!value.includes("\0")) this.lastId = value;
        break;
      case "retry":
        if (/^\d+$/.test(value)) this.lastRetry = Number(value);
        break;
      default:
        break; // unknown field: ignored (forward compatible)
    }
    return null;
  }

  private dispatch(): SSEFrame | null {
    if (this.dataLines.length === 0) {
      this.eventName = "";
      return null;
    }
    const frame: SSEFrame = {
      event: this.eventName || "message",
      data: this.dataLines.join("\n"),
      ...(this.lastId !== undefined ? { id: this.lastId } : {}),
      ...(this.lastRetry !== undefined ? { retry: this.lastRetry } : {}),
    };
    this.eventName = "";
    this.dataLines = [];
    this.dataBytes = 0;
    return frame;
  }
}

export interface ReadChatEventsOptions {
  /** Called for every network read (including heartbeat-only chunks). The idle watchdog hooks in here. */
  onActivity?: () => void;
  signal?: AbortSignal;
  maxEventBytes?: number;
}

/**
 * Async-iterate validated chat events from a streaming body.
 *  - unknown event names are skipped silently (forward compatible)
 *  - bad JSON / bad shape / oversize event → ProtocolError (never swallowed)
 *  - always releases the reader lock and cancels the body on early exit
 */
export async function* readChatEvents(
  body: ReadableStream<Uint8Array>,
  options: ReadChatEventsOptions = {},
): AsyncGenerator<ChatEvent, void, void> {
  const reader = body.getReader();
  const parser = new SSEParser({ maxEventBytes: options.maxEventBytes });
  const onAbort = () => {
    reader.cancel().catch(() => undefined);
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      options.onActivity?.();
      for (const frame of parser.feed(value)) {
        const event = decodeEvent(frame.event, frame.data);
        if (event) yield event;
      }
    }
    for (const frame of parser.end()) {
      const event = decodeEvent(frame.event, frame.data);
      if (event) yield event;
    }
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
    // Cancel (not just release): propagates "stop reading" to the network so the BFF can abort upstream.
    await reader.cancel().catch(() => undefined);
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
}
