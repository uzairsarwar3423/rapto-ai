import { create } from "zustand";

export type ConnectionStatus = "connected" | "connecting" | "disconnected";

interface RealtimeState {
  connectionStatus: ConnectionStatus;
  presence: Map<string, number>; // userId -> lastSeenAt (epoch ms)
  flashedRows: Set<string>; // Set of userIds currently flashing
  setConnectionStatus: (status: ConnectionStatus) => void;
  recordPresence: (userId: string, timestamp: number) => void;
  prunePresence: (staleAfterMs: number) => void;
  flashRow: (id: string) => void;
  clearFlashedRow: (id: string) => void;
}

export const useRealtimeStore = create<RealtimeState>((set, get) => ({
  connectionStatus: "disconnected",
  presence: new Map(),
  flashedRows: new Set(),

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  recordPresence: (userId, timestamp) =>
    set((s) => {
      const next = new Map(s.presence);
      next.set(userId, timestamp);
      return { presence: next };
    }),

  prunePresence: (staleAfterMs) =>
    set((s) => {
      const cutoff = Date.now() - staleAfterMs;
      const next = new Map([...s.presence].filter(([, ts]) => ts > cutoff));
      // Zustand optimization: skip state update if no presence was pruned
      return next.size === s.presence.size ? {} : { presence: next };
    }),

  flashRow: (id) => {
    set((s) => {
      const next = new Set(s.flashedRows);
      next.add(id);
      return { flashedRows: next };
    });

    // Auto-clear after 1500ms to keep it transient
    setTimeout(() => {
      get().clearFlashedRow(id);
    }, 1500);
  },

  clearFlashedRow: (id) =>
    set((s) => {
      if (!s.flashedRows.has(id)) return {};
      const next = new Set(s.flashedRows);
      next.delete(id);
      return { flashedRows: next };
    }),
}));
