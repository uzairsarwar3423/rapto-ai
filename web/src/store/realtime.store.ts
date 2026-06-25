import { create } from "zustand";

export type ConnectionStatus = "connected" | "connecting" | "disconnected";

interface RealtimeState {
  connectionStatus: ConnectionStatus;
  setConnectionStatus: (status: ConnectionStatus) => void;
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  connectionStatus: "disconnected",
  setConnectionStatus: (status) => set({ connectionStatus: status }),
}));
