"use client";

import React, { useRef } from "react";
import { useUIStore } from "@/store/ui.store";

interface SidebarProviderProps {
  defaultCollapsed: boolean;
  children: React.ReactNode;
}

export function SidebarProvider({ defaultCollapsed, children }: SidebarProviderProps) {
  const isInitialized = useRef(false);

  // Initialize the Zustand store with the cookie state on first client-side render
  // This executes immediately in the render pass to prevent a FOUC layout shift.
  if (!isInitialized.current) {
    useUIStore.setState({ sidebarCollapsed: defaultCollapsed });
    isInitialized.current = true;
  }

  return <>{children}</>;
}
