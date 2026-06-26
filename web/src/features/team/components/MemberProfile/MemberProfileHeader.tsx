"use client";

import React, { useMemo, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { RoleBadge } from "../RoleBadge";
import { getAvailableActions } from "../MemberTable/MemberRow";
import { formatDate } from "@/lib/utils/format-date";
import type { TeamMember } from "../../types/team.types";
import { ChangeMemberRoleSheet } from "../ChangeMemberRoleSheet";
import { RemoveMemberSheet } from "../RemoveMemberSheet";

interface MemberProfileHeaderProps {
  member: TeamMember;
}

export function MemberProfileHeader({ member }: MemberProfileHeaderProps) {
  const requester = useAuthStore((state) => state.user);
  
  const [showRoleSheet, setShowRoleSheet] = useState(false);
  const [showRemoveSheet, setShowRemoveSheet] = useState(false);

  const actions = useMemo(() => {
    if (!requester) return [];
    return getAvailableActions(member, { id: requester.id, role: requester.role });
  }, [member, requester]);

  const joinDate = member.joinedAt || "";
  const formattedJoinDate = joinDate ? formatDate(joinDate, "long") : "";

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-border select-none">
        {/* Info Block */}
        <div className="flex items-center gap-4">
          <Avatar className="size-16 shrink-0 border border-border">
            <AvatarImage src={member.avatarUrl || undefined} alt={member.name} />
            <AvatarFallback className="text-lg font-semibold bg-muted text-muted-foreground uppercase">
              {member.name.substring(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-semibold text-foreground tracking-tight font-plus-jakarta truncate">
                {member.name}
              </h1>
              <RoleBadge role={member.role} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{member.email}</p>
            {formattedJoinDate && (
              <p className="text-[11px] text-muted-foreground/80 mt-1.5">
                Joined on {formattedJoinDate}
              </p>
            )}
          </div>
        </div>

        {/* Action Button */}
        {actions.length > 0 && (
          <div className="flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1.5 h-8 px-3 font-semibold text-xs border border-border hover:bg-muted focus-visible:ring-1 focus-visible:ring-ring transition-all duration-200"
                >
                  Actions
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 bg-white">
                {actions.map((action) => (
                  <DropdownMenuItem
                    key={action.id}
                    className={action.destructive ? "text-error focus:text-error" : ""}
                    onClick={() => {
                      if (action.id === "change-role") {
                        setShowRoleSheet(true);
                      } else if (action.id === "remove") {
                        setShowRemoveSheet(true);
                      }
                    }}
                  >
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <ChangeMemberRoleSheet
        member={member}
        open={showRoleSheet}
        onOpenChange={setShowRoleSheet}
      />
      <RemoveMemberSheet
        member={member}
        open={showRemoveSheet}
        onOpenChange={setShowRemoveSheet}
      />
    </>
  );
}
