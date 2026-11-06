/**
 * chatSessionsApi.ts — React Query hooks for server data: sessions, history, suggestions, rename/delete/feedback.
 * Every key embeds `${teamId}:${userId}` (see chatKeys). Messages live ONLY in this cache (ADR-4).
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import {
  messageListSchema, sessionListSchema, sessionSchema, suggestionListSchema,
  type FeedbackRequest, type MessageList, type SessionList,
} from "@/lib/contracts/chat";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { chatKeys, chatScopeOf } from "../state/chatKeys";
import { ChatRequestError } from "./chatClient";
import { chatHttp } from "./chatHttp";

export function useChatScope(): string | null {
  return useAuthStore((s) => chatScopeOf(s.user));
}

const noRetryOn = (failureCount: number, error: unknown) =>
  !(error instanceof ChatRequestError && [401, 403, 404, 422].includes(error.info.status)) && failureCount < 1;

export function useChatSessions() {
  const scope = useChatScope();
  return useInfiniteQuery({
    queryKey: chatKeys.sessions(scope ?? "none"),
    enabled: !!scope,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      chatHttp(`/api/ai/chat/sessions?limit=30${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, { schema: sessionListSchema, signal }),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 30_000,
    retry: noRetryOn,
  });
}

export function useChatMessages(sessionId: string | null) {
  const scope = useChatScope();
  return useInfiniteQuery({
    queryKey: chatKeys.messages(scope ?? "none", sessionId ?? "none"),
    enabled: !!scope && !!sessionId,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      chatHttp(`/api/ai/chat/sessions/${encodeURIComponent(sessionId!)}/messages?limit=30${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, {
        schema: messageListSchema, signal,
      }),
    // `next_cursor` pages toward OLDER messages; page 0 is the newest.
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 15_000,
    retry: noRetryOn,
  });
}

/** Pages are newest-first; items within a page are chronological. Flatten to one oldest→newest list. */
export function flattenMessages(data: { pages: MessageList[] } | undefined) {
  if (!data) return [];
  return [...data.pages].reverse().flatMap((p) => p.items);
}

export function useChatSuggestions(enabled = true) {
  const scope = useChatScope();
  return useQuery({
    queryKey: chatKeys.suggestions(scope ?? "none"),
    enabled: !!scope && enabled,
    queryFn: ({ signal }) => chatHttp("/api/ai/chat/suggestions", { schema: suggestionListSchema, signal }),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useRenameSession() {
  const qc = useQueryClient();
  const scope = useChatScope() ?? "none";
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      chatHttp(`/api/ai/chat/sessions/${encodeURIComponent(id)}`, { method: "PATCH", body: { title }, schema: sessionSchema }),
    onMutate: async ({ id, title }) => {
      await qc.cancelQueries({ queryKey: chatKeys.sessions(scope) });
      const prev = qc.getQueryData<InfiniteData<SessionList>>(chatKeys.sessions(scope));
      qc.setQueryData<InfiniteData<SessionList>>(chatKeys.sessions(scope), (old) =>
        old && { ...old, pages: old.pages.map((p) => ({ ...p, items: p.items.map((s) => (s.id === id ? { ...s, title } : s)) })) });
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(chatKeys.sessions(scope), ctx.prev),
    onSettled: () => void qc.invalidateQueries({ queryKey: chatKeys.sessions(scope) }),
  });
}

export function useDeleteSession() {
  const qc = useQueryClient();
  const scope = useChatScope() ?? "none";
  return useMutation({
    mutationFn: (id: string) => chatHttp(`/api/ai/chat/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: chatKeys.sessions(scope) });
      const prev = qc.getQueryData<InfiniteData<SessionList>>(chatKeys.sessions(scope));
      qc.setQueryData<InfiniteData<SessionList>>(chatKeys.sessions(scope), (old) =>
        old && { ...old, pages: old.pages.map((p) => ({ ...p, items: p.items.filter((s) => s.id !== id) })) });
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(chatKeys.sessions(scope), ctx.prev),
    onSuccess: (_d, id) => qc.removeQueries({ queryKey: chatKeys.messages(scope, id) }),
    onSettled: () => void qc.invalidateQueries({ queryKey: chatKeys.sessions(scope) }),
  });
}

export function useSubmitFeedback() {
  return useMutation({
    mutationFn: ({ messageId, ...body }: FeedbackRequest & { messageId: string }) =>
      chatHttp(`/api/ai/chat/messages/${encodeURIComponent(messageId)}/feedback`, { method: "POST", body }),
  });
}
