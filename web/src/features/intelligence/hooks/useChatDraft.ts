"use client";

import { useCallback, useState } from "react";
import { DRAFT_PREFIX } from "../state/streamManager";

function read(key: string | null): string {
  try {
    return key ? sessionStorage.getItem(key) ?? "" : "";
  } catch {
    return ""; // storage blocked: the draft is simply not persisted
  }
}

/**
 * Per-conversation draft in sessionStorage (cleared on logout by clearChatLocalState, which removes every key under
 * DRAFT_PREFIX). Draft text is the user own unsent input; it is never sent anywhere or put in telemetry.
 */
export function useChatDraft(scope: string | null, sessionId: string | null) {
  const key = scope ? `${DRAFT_PREFIX}draft:${scope}:${sessionId ?? "new"}` : null;
  const [state, setState] = useState(() => ({ key, value: read(key) }));

  // Switched conversation: load that conversation draft (render-phase derivation, no effect needed).
  if (state.key !== key) setState({ key, value: read(key) });

  const update = useCallback((next: string) => {
    setState({ key, value: next });
    if (!key) return;
    try {
      if (next) sessionStorage.setItem(key, next);
      else sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }, [key]);

  return [state.key === key ? state.value : read(key), update] as const;
}
