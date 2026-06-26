// web/src/features/team/components/TeamHealthDashboard/TeamHealthDashboard.tsx

"use client";

import React, { useState } from "react";
import { UserPlus } from "lucide-react";
import { useTeamMembers } from "../../hooks/useTeamMembers";
import { TeamHealthStats } from "./TeamHealthStats";
import { MemberTable } from "../MemberTable/MemberTable";
import { MemberTableSkeleton } from "../MemberTable/MemberTableSkeleton";
import { InviteMemberSheet } from "../InviteMemberSheet";
import { Button } from "@/components/ui/button";

export function TeamHealthDashboard() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const { data: members, isPending } = useTeamMembers();

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto px-6 py-6">
      {/* Header section */}
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold font-heading text-foreground tracking-tight">
            Team Health
          </h1>
          <p className="text-xs text-muted-foreground">
            Monitor teammate commitment fulfillment and tracking stats for the last 30 days.
          </p>
        </div>
        <Button
          size="sm"
          className="flex items-center gap-1.5 bg-brand hover:bg-brand/90 text-white font-medium"
          onClick={() => setInviteOpen(true)}
        >
          <UserPlus className="size-4" />
          Invite Teammates
        </Button>
      </div>

      {/* Health Stats Cards */}
      <TeamHealthStats />

      {/* Member Table Grid */}
      <div className="flex flex-col gap-3.5 mt-2">
        <h2 className="text-sm font-semibold font-heading text-foreground tracking-tight">
          Teammate Directory
        </h2>
        {isPending ? (
          <MemberTableSkeleton />
        ) : (
          <MemberTable members={members || []} />
        )}
      </div>

      {/* Invite Member Drawer Sheet */}
      <InviteMemberSheet open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}
