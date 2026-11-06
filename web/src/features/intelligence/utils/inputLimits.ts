/**
 * inputLimits.ts — message length rules, mirroring the backend so the UI never promises what the server rejects.
 *
 * The backend counts Unicode CODE POINTS (Python `len`), not UTF-16 units, so "😀" is 1, not 2. It checks the raw text
 * (Pydantic `max_length`) and again after NFC normalisation and stripping control / bidi-override / zero-width characters
 * (`sanitize_text`). Over-long text is REJECTED, never truncated. The server additionally has a token cap the browser
 * cannot compute (Urdu passes 2,000 characters and still blows the token budget): that arrives as a 422 and is shown
 * as "shorten your message".
 */
import { CHAT_LIMITS } from "@/lib/contracts/chat";

const INVISIBLE = /[​-‏‪-‮⁠-⁯﻿­؜᠎￹-￻]/g;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;

export const countChars = (text: string): number => Array.from(text).length;

/** Same normalisation the server applies before its second length check. */
export function sanitizeForCount(text: string): string {
  return text
    .normalize("NFC")
    .replace(INVISIBLE, "")
    .replace(CONTROL, "")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type MessageProblem = "empty" | "char_limit";

export interface MessageCheck {
  ok: boolean;
  count: number;
  limit: number;
  problem?: MessageProblem;
  /** Show the counter once usage passes the threshold (or the limit is exceeded). */
  showCounter: boolean;
}

export function checkMessage(text: string, limit: number = CHAT_LIMITS.messageMaxChars): MessageCheck {
  const count = countChars(text);
  const cleanedCount = countChars(sanitizeForCount(text));
  const showCounter = count >= Math.floor(limit * CHAT_LIMITS.counterThreshold);
  if (cleanedCount === 0) return { ok: false, count, limit, problem: "empty", showCounter };
  if (count > limit || cleanedCount > limit) return { ok: false, count: Math.max(count, cleanedCount), limit, problem: "char_limit", showCounter: true };
  return { ok: true, count, limit, showCounter };
}
