"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { socketManager } from "@/shared/lib/websocket/socket";
import { SERVER_EVENTS } from "@/shared/lib/websocket/socket.events";
import { useCommitmentMutationCache } from "./useCommitmentMutationCache";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { fireRealtimeToast } from "@/components/shared/feedback/RealtimeToast";

export function useRealtimeCommitments() {
  const queryClient = useQueryClient();
  const { patchCommitment } = useCommitmentMutationCache();
  const { user } = useAuth();

  useEffect(() => {
    const socket = socketManager.getSocket();
    if (!socket) return;

    const handleCreated = () => {
      // Invalidate all commitments queries to pull fresh data
      queryClient.invalidateQueries({ queryKey: ["commitments"] });
    };

    const handleFulfilled = (payload: { id: string; resolvedAt: string }) => {
      patchCommitment(payload.id, {
        status: "FULFILLED",
        resolvedAt: payload.resolvedAt,
      });
    };

    const handleDeferred = (payload: { id: string }) => {
      patchCommitment(payload.id, {
        status: "DEFERRED",
      });
    };

    const handleMissed = (payload: {
      id: string;
      ownerId: string;
      ownerName?: string;
      text?: string;
    }) => {
      patchCommitment(payload.id, {
        status: "MISSED",
      });

      // Trigger manager-only toast if current user is ADMIN/OWNER/MANAGER
      const isManager = user && ["OWNER", "ADMIN", "MANAGER"].includes(user.role);
      if (isManager) {
        fireRealtimeToast("commitment:missed", {
          title: `${payload.ownerName || "A member"} missed a commitment`,
          description: payload.text || "Commitment deadline passed",
          href: `/team/${payload.ownerId}`,
        });
      }
    };

    const handleMemberScoreUpdated = (payload: {
      memberId: string;
      teamId: string;
      score: number;
    }) => {
      // 1. Update team member list query cache
      queryClient.setQueriesData<any>(
        { queryKey: ["teams", payload.teamId, "members"] },
        (oldData: any) => {
          if (!oldData) return oldData;
          if (oldData && typeof oldData === "object" && Array.isArray(oldData.members)) {
            return {
              ...oldData,
              members: oldData.members.map((m: any) =>
                m.id === payload.memberId ? { ...m, commitmentScore: payload.score } : m
              ),
            };
          }
          if (Array.isArray(oldData)) {
            return oldData.map((m: any) =>
              m.id === payload.memberId ? { ...m, commitmentScore: payload.score } : m
            );
          }
          return oldData;
        }
      );

      // 2. Update individual member detail query cache
      queryClient.setQueriesData<any>(
        { queryKey: ["teams", payload.teamId, "members", payload.memberId] },
        (oldData: any) => {
          if (!oldData) return oldData;
          return { ...oldData, commitmentScore: payload.score };
        }
      );

      // 3. Update team members flat list query cache
      queryClient.setQueriesData<any[]>(
        { queryKey: ["team", "members"] },
        (oldData: any) => {
          if (!oldData) return oldData;
          return oldData.map((m: any) =>
            m.id === payload.memberId ? { ...m, commitmentScore: payload.score } : m
          );
        }
      );
    };

    socket.on(SERVER_EVENTS.COMMITMENT_CREATED, handleCreated);
    socket.on(SERVER_EVENTS.COMMITMENT_FULFILLED, handleFulfilled);
    socket.on(SERVER_EVENTS.COMMITMENT_DEFERRED, handleDeferred);
    socket.on(SERVER_EVENTS.COMMITMENT_MISSED, handleMissed);
    socket.on(SERVER_EVENTS.MEMBER_SCORE_UPDATED, handleMemberScoreUpdated);

    return () => {
      socket.off(SERVER_EVENTS.COMMITMENT_CREATED, handleCreated);
      socket.off(SERVER_EVENTS.COMMITMENT_FULFILLED, handleFulfilled);
      socket.off(SERVER_EVENTS.COMMITMENT_DEFERRED, handleDeferred);
      socket.off(SERVER_EVENTS.COMMITMENT_MISSED, handleMissed);
      socket.off(SERVER_EVENTS.MEMBER_SCORE_UPDATED, handleMemberScoreUpdated);
    };
  }, [queryClient, patchCommitment, user]);
}
