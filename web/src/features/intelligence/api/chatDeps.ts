/**
 * chatDeps.ts — wires the pure transport (`chatClient`) to the app's auth: the in-memory/cookie access token and the
 * single-flight refresher (so a stream that hits an expired 15-minute token shares the one refresh every other
 * request uses, and the existing session-expired modal still fires when the refresh token is dead).
 */
import Cookies from "js-cookie";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { executeTokenRefresh } from "@/features/auth/utils/auth-refresh";
import type { ChatClientDeps } from "./chatClient";

export function currentAccessToken(): string | null {
  return useAuthStore.getState().accessToken || (typeof window !== "undefined" ? Cookies.get("rapto_access") ?? null : null);
}

export async function refreshAccessToken(): Promise<string | null> {
  const result = await executeTokenRefresh();
  return "accessToken" in result && result.accessToken ? result.accessToken : null;
}

export function defaultChatDeps(): ChatClientDeps {
  return { getAccessToken: currentAccessToken, refreshAccessToken };
}
