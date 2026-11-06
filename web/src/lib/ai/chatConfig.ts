import "server-only";

/**
 * ai/chatConfig.ts — server-only configuration for the chat BFF.
 *
 * Read lazily (per call) so a missing secret degrades the chat routes to 503 instead of breaking `next build`, and so
 * tests can set the environment per case. The upstream base URL is a FIXED server-side constant: it is never derived
 * from request data (no SSRF / no path-redirect surface).
 */

import { getServerApiUrl } from "@/lib/api/config";
import { ChatHttpError } from "./chatErrors";

export interface ChatServerConfig {
  /** AI service base (private network). */
  aiBaseUrl: string;
  /** Express API base, used only to resolve the signed-in user. */
  apiBaseUrl: string;
  privateKeyPem: string;
  kid: string;
  issuer: string;
  audience: string;
  /** Service-JWT lifetime. The AI service rejects anything above 60 s (+ leeway). */
  tokenTtlS: number;
}

const DEFAULT_AI_URL = "http://ai-pipeline:8001";

export function getChatServerConfig(env: NodeJS.ProcessEnv = process.env): ChatServerConfig {
  const privateKeyPem = (env.INTERNAL_JWT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n").trim();
  const kid = (env.INTERNAL_JWT_KID ?? "").trim();
  if (!privateKeyPem || !kid) {
    console.error("[chat-bff] INTERNAL_JWT_PRIVATE_KEY / INTERNAL_JWT_KID are not configured");
    throw new ChatHttpError("SERVICE_UNAVAILABLE", { retryable: false });
  }
  const ttl = Number(env.INTERNAL_JWT_TTL_S ?? 45);
  return {
    aiBaseUrl: (env.AI_CHAT_URL?.trim() || env.AI_PIPELINE_URL?.trim() || DEFAULT_AI_URL).replace(/\/$/, ""),
    apiBaseUrl: getServerApiUrl(),
    privateKeyPem,
    kid,
    issuer: env.INTERNAL_JWT_ISSUER?.trim() || "vocaply-bff",
    audience: env.INTERNAL_JWT_AUDIENCE?.trim() || "vocaply-ai-chat",
    tokenTtlS: Number.isFinite(ttl) ? Math.min(Math.max(Math.trunc(ttl), 5), 55) : 45,
  };
}
