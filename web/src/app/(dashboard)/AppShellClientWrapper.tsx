"use client";

import type { ReactNode } from "react";
import { AppShell } from "@/components/shared/layout/AppShell";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useSocketReconnectToast } from "@/shared/hooks/useSocketReconnectToast";
import { usePresenceHeartbeat } from "@/shared/hooks/usePresenceHeartbeat";
import { useRealtimeCommitments } from "@/features/commitments/hooks/useRealtimeCommitments";
import { useRealtimeActionItems } from "@/features/action-items/hooks/useRealtimeActionItems";
import { useRealtimeTeam } from "@/features/team/hooks/useRealtimeTeam";
import { OfflineBanner } from "@/components/shared/feedback/OfflineBanner";

interface AppShellClientWrapperProps {
  defaultCollapsed: boolean;
  children: ReactNode;
}

export function AppShellClientWrapper({
  defaultCollapsed,
  children,
}: AppShellClientWrapperProps) {
  const { user } = useAuth();
  
  // Initialize the socket reconnect toast listener
  useSocketReconnectToast();

  // Initialize all realtime listeners
  usePresenceHeartbeat();
  useRealtimeCommitments();
  useRealtimeActionItems();
  useRealtimeTeam();

  // Extract team metadata from the authenticated user object
  const team = user?.team
    ? { id: user.teamId || "", name: user.team.name, plan: user.team.plan || "Free" }
    : null;

  return (
    <div className="flex flex-col min-h-screen">
      <OfflineBanner />
      <AppShell user={user} team={team} defaultCollapsed={defaultCollapsed}>
        {children}
      </AppShell>
    </div>
  );
}
