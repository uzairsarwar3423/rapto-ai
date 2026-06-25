"use client";

import type { ReactNode } from "react";
import { AppShell } from "@/components/shared/layout/AppShell";
import { useAuth } from "@/features/auth/hooks/useAuth";

interface AppShellClientWrapperProps {
  defaultCollapsed: boolean;
  children: ReactNode;
}

import { useSocketReconnectToast } from "@/shared/hooks/useSocketReconnectToast";

export function AppShellClientWrapper({
  defaultCollapsed,
  children,
}: AppShellClientWrapperProps) {
  const { user } = useAuth();
  
  // Initialize the socket reconnect toast listener
  useSocketReconnectToast();

  // Extract team metadata from the authenticated user object
  const team = user?.team
    ? { id: user.teamId || "", name: user.team.name, plan: "Growth" }
    : null;

  return (
    <AppShell user={user} team={team} defaultCollapsed={defaultCollapsed}>
      {children}
    </AppShell>
  );
}
