/**
 * chatKeys.ts — React Query keys and the cache-isolation scope.
 *
 * Every key embeds `${teamId}:${userId}`. A different user (or team) on the same browser can therefore never be served
 * another user's cached chat data, even if a clear were missed; logout/scope change additionally wipes everything.
 */
import { useAuthStore } from "@/features/auth/store/auth.store";

export function chatScopeOf(user: { id?: string | null; teamId?: string | null } | null | undefined): string | null {
  return user?.id && user.teamId ? `${user.teamId}:${user.id}` : null;
}

export function getChatScope(): string | null {
  return chatScopeOf(useAuthStore.getState().user);
}

export const chatKeys = {
  all: ["chat"] as const,
  scope: (scope: string) => ["chat", scope] as const,
  sessions: (scope: string) => ["chat", scope, "sessions"] as const,
  messages: (scope: string, sessionId: string) => ["chat", scope, "messages", sessionId] as const,
  suggestions: (scope: string) => ["chat", scope, "suggestions"] as const,
};
