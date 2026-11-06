/**
 * chatHttp.ts — JSON calls to /api/ai/chat/* (everything except the stream). Same auth behaviour as the stream:
 * bearer token, one refresh-and-retry on 401, errors normalised to ChatRequestError.
 */
import type { ZodType } from "zod";
import { ChatRequestError, parseErrorResponse } from "./chatClient";
import { currentAccessToken, refreshAccessToken } from "./chatDeps";

export interface ChatHttpOptions<T> {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  schema?: ZodType<T>;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export async function chatHttp<T = void>(path: string, opts: ChatHttpOptions<T> = {}): Promise<T> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  let token = currentAccessToken();
  let refreshed = false;

  for (;;) {
    const res = await fetchImpl(path, {
      method: opts.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      cache: "no-store",
      credentials: "same-origin",
    });

    if (res.status === 401 && !refreshed) {
      refreshed = true;
      const fresh = await refreshAccessToken();
      if (fresh) {
        token = fresh;
        continue;
      }
    }
    if (!res.ok) throw new ChatRequestError(await parseErrorResponse(res));
    if (res.status === 204 || !opts.schema) return undefined as T;

    const parsed = opts.schema.safeParse(await res.json());
    if (!parsed.success) {
      throw new ChatRequestError({ code: "SERVICE_UNAVAILABLE", message: "Received an unreadable response.", retryable: true, status: 502 });
    }
    return parsed.data;
  }
}
