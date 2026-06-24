import { create } from "zustand";

interface UIState {
  sidebarCollapsed: boolean;
  commandMenuOpen: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setCommandMenuOpen: (open: boolean) => void;
  toggleCommandMenu: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false, // Default value, will be hydrated from cookie in provider
  commandMenuOpen: false,

  setSidebarCollapsed: (collapsed) => {
    // Set the cookie so subsequent server renders read it directly
    document.cookie = `sidebar:collapsed=${collapsed}; path=/; max-age=31536000; SameSite=Lax`;
    set({ sidebarCollapsed: collapsed });
  },

  toggleSidebar: () =>
    set((state) => {
      const nextState = !state.sidebarCollapsed;
      document.cookie = `sidebar:collapsed=${nextState}; path=/; max-age=31536000; SameSite=Lax`;
      return { sidebarCollapsed: nextState };
    }),

  setCommandMenuOpen: (open) => set({ commandMenuOpen: open }),

  toggleCommandMenu: () => set((state) => ({ commandMenuOpen: !state.commandMenuOpen })),
}));
