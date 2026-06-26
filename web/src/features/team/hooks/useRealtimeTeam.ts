"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { socketManager } from "@/shared/lib/websocket/socket";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { useRealtimeStore } from "@/store/realtime.store";
import { useAuth } from "@/features/auth/hooks/useAuth";

export function useRealtimeTeam() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    const socket = socketManager.getSocket();
    if (!socket) return;

    const handleJoined = (payload: { user: any }) => {
      const newUser = payload.user;
      if (!newUser) return;

      // 1. Flash new row in UI
      useRealtimeStore.getState().flashRow(newUser.id);

      // 2. Patch ["team", "members"] (flat array)
      queryClient.setQueriesData<any[]>({ queryKey: ["team", "members"] }, (oldData: any) => {
        if (!oldData) return [newUser];
        if (oldData.some((m: any) => m.id === newUser.id)) return oldData;
        return [...oldData, newUser];
      });

      // 3. Patch ["teams", teamId, "members"] (list)
      if (user?.teamId) {
        queryClient.setQueriesData<any>(
          { queryKey: ["teams", user.teamId, "members"] },
          (oldData: any) => {
            if (!oldData) return oldData;
            // If paginated { members: Member[] }
            if (oldData && typeof oldData === "object" && Array.isArray(oldData.members)) {
              if (oldData.members.some((m: any) => m.id === newUser.id)) return oldData;
              return {
                ...oldData,
                members: [...oldData.members, newUser],
              };
            }
            // If flat array
            if (Array.isArray(oldData)) {
              if (oldData.some((m: any) => m.id === newUser.id)) return oldData;
              return [...oldData, newUser];
            }
            return oldData;
          }
        );
      }
    };

    const handleRemoved = (payload: { userId: string }) => {
      const targetUserId = payload.userId;

      // 1. Patch ["team", "members"]
      queryClient.setQueriesData<any[]>({ queryKey: ["team", "members"] }, (oldData: any) => {
        if (!oldData) return [];
        return oldData.filter((m: any) => m.id !== targetUserId);
      });

      // 2. Patch ["teams", teamId, "members"]
      if (user?.teamId) {
        queryClient.setQueriesData<any>(
          { queryKey: ["teams", user.teamId, "members"] },
          (oldData: any) => {
            if (!oldData) return oldData;
            if (oldData && typeof oldData === "object" && Array.isArray(oldData.members)) {
              return {
                ...oldData,
                members: oldData.members.filter((m: any) => m.id !== targetUserId),
              };
            }
            if (Array.isArray(oldData)) {
              return oldData.filter((m: any) => m.id !== targetUserId);
            }
            return oldData;
          }
        );
      }
    };

    const handleSystemRemoved = (payload: { teamId: string }) => {
      // Force redirect self if removed from team
      useAuthStore.getState().clearAuth();
      window.location.href = "/login";
    };

    const handleRoleUpdated = (payload: { newRole: any }) => {
      // Update self role if role updated
      const currentUser = useAuthStore.getState().user;
      if (currentUser) {
        useAuthStore.getState().setUser({
          ...currentUser,
          role: payload.newRole,
        });
      }

      // Invalidate dashboard/team detail queries
      if (user?.teamId) {
        queryClient.invalidateQueries({ queryKey: ["teams", user.teamId] });
      }
      queryClient.invalidateQueries({ queryKey: ["team", "members"] });
    };

    socket.on("member:joined", handleJoined);
    socket.on("member:removed", handleRemoved);
    socket.on("system:removed_from_team", handleSystemRemoved);
    socket.on("my:role_updated", handleRoleUpdated);

    return () => {
      socket.off("member:joined", handleJoined);
      socket.off("member:removed", handleRemoved);
      socket.off("system:removed_from_team", handleSystemRemoved);
      socket.off("my:role_updated", handleRoleUpdated);
    };
  }, [queryClient, user?.teamId]);
}
