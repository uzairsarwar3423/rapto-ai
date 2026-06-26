"use client";

import React, { useMemo } from "react";
import { useRealtimeStore } from "@/store/realtime.store";
import { useTeamMembers } from "@/features/commitments/hooks/useTeamMembers";
import { useAuth } from "@/features/auth/hooks/useAuth";

function getInitials(name: string) {
  if (!name) return "";
  const parts = name.split(" ");
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`;
  }
  return name.slice(0, 2);
}

export function PresenceAvatars() {
  const presence = useRealtimeStore((state) => state.presence);
  const { data: members = [] } = useTeamMembers();
  const { user: currentUser } = useAuth();

  const activeMembers = useMemo(() => {
    const cutoff = Date.now() - 60000; // 60 seconds cutoff
    const activeIds = new Set(
      Array.from(presence.entries())
        .filter(([, timestamp]) => timestamp > cutoff)
        .map(([userId]) => userId)
    );

    return members.filter(
      (m) => activeIds.has(m.id) && m.id !== currentUser?.id
    );
  }, [presence, members, currentUser?.id]);

  if (activeMembers.length === 0) return null;

  const displayLimit = 5;
  const displayed = activeMembers.slice(0, displayLimit);
  const overflowCount = activeMembers.length - displayLimit;

  return (
    <div className="flex items-center select-none" aria-label="Online team members">
      <div className="flex -space-x-2 mr-2">
        {displayed.map((member, index) => {
          const initials = getInitials(member.name);
          return (
            <div
              key={member.id}
              className="relative group transition-transform duration-200 hover:-translate-y-0.5 hover:z-30 cursor-help"
              style={{ zIndex: displayLimit - index }}
              title={`${member.name} (${member.role})`}
            >
              {member.avatarUrl ? (
                <img
                  src={member.avatarUrl}
                  alt={member.name}
                  className="h-7 w-7 rounded-full border-2 border-background object-cover bg-background"
                />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-primary-foreground text-primary text-[10px] font-semibold uppercase leading-none font-sans">
                  {initials}
                </div>
              )}
              {/* Green indicator dot for active member */}
              <span className="absolute bottom-0 right-0 block h-2 w-2 rounded-full ring-2 ring-background bg-emerald-500" />
            </div>
          );
        })}
      </div>
      {overflowCount > 0 && (
        <span className="text-[11px] font-semibold text-muted-foreground font-sans bg-muted px-2 py-0.5 rounded-full border border-border">
          +{overflowCount}
        </span>
      )}
    </div>
  );
}
