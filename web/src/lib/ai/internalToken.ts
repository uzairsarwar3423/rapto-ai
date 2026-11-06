import "server-only";

/**
 * ai/internalToken.ts
 * ───────────────────
 * Mints the short-lived SERVICE JWT that authenticates the BFF to the AI service (Day 58 §8):
 *
 *   header  { alg: RS256, typ: JWT, kid }
 *   claims  iss=vocaply-bff  aud=vocaply-ai-chat  iat  exp (≤ 60 s)  jti  team_id user_id role plan tz  rid?
 *
 * Server-only (the `server-only` import makes a client bundle fail the build). The private key comes from the
 * environment/secret manager and is never logged. Implemented on Node's crypto: no new dependency, and the algorithm
 * is fixed in code — there is no code path that selects `none` or an HS* algorithm.
 */

import { createPrivateKey, createSign, randomUUID, type KeyObject } from "node:crypto";
import { ChatHttpError } from "./chatErrors";
import type { ChatServerConfig } from "./chatConfig";

export interface ChatTokenClaims {
  team_id: string;
  user_id: string;
  role: string;
  /** Already mapped to the AI service's plan vocabulary (see identity.ts). */
  plan: string;
  /** IANA timezone. */
  tz: string;
  /** Request id, propagated into the AI service logs. */
  rid?: string;
}

const b64url = (input: Buffer | string): string => Buffer.from(input).toString("base64url");

const keyCache = new Map<string, KeyObject>();

function loadKey(pem: string): KeyObject {
  const hit = keyCache.get(pem);
  if (hit) return hit;
  let key: KeyObject;
  try {
    key = createPrivateKey(pem);
  } catch {
    console.error("[chat-bff] INTERNAL_JWT_PRIVATE_KEY is not a valid PEM private key");
    throw new ChatHttpError("SERVICE_UNAVAILABLE", { retryable: false });
  }
  if (key.asymmetricKeyType !== "rsa" || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) {
    console.error("[chat-bff] INTERNAL_JWT_PRIVATE_KEY must be an RSA key of at least 2048 bits");
    throw new ChatHttpError("SERVICE_UNAVAILABLE", { retryable: false });
  }
  keyCache.set(pem, key);
  return key;
}

export function mintChatToken(claims: ChatTokenClaims, cfg: ChatServerConfig, nowMs: number = Date.now()): string {
  const iat = Math.floor(nowMs / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: cfg.kid };
  const payload = {
    iss: cfg.issuer,
    aud: cfg.audience,
    iat,
    exp: iat + cfg.tokenTtlS,
    jti: randomUUID(),
    team_id: claims.team_id,
    user_id: claims.user_id,
    role: claims.role,
    plan: claims.plan,
    tz: claims.tz,
    ...(claims.rid ? { rid: claims.rid } : {}),
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(loadKey(cfg.privateKeyPem));
  return `${signingInput}.${b64url(signature)}`;
}
