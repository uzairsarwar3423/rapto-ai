"use client";

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { teamApi } from "../api/team.api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Crown, Shield as ShieldIcon, User as UserIcon } from "lucide-react";
import type { TeamMember, UserRole } from "../types/team.types";

interface ChangeMemberRoleSheetProps {
  member: TeamMember;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ROLE_LEVEL: Record<string, number> = {
  OWNER: 4,
  ADMIN: 3,
  MANAGER: 2,
  MEMBER: 1,
};

export function ChangeMemberRoleSheet({ member, open, onOpenChange }: ChangeMemberRoleSheetProps) {
  const queryClient = useQueryClient();
  const requester = useAuthStore((state) => state.user);
  const teamId = requester?.teamId || "";

  const [role, setRole] = useState<UserRole>(member.role);

  const changeRoleMutation = useMutation({
    mutationFn: () => teamApi.changeRole(member.id, role),
    onSuccess: () => {
      toast.success(`Updated ${member.name}'s role to ${role.toLowerCase()}`);
      if (teamId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.team.members(teamId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.team.member(teamId, member.id) });
      }
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || "Failed to update role");
    },
  });

  const reqRole = requester?.role || "MEMBER";

  // Filter selectable roles: requester can only assign roles STRICTLY below their own level
  const selectableRoles = (Object.keys(ROLE_LEVEL) as UserRole[]).filter(
    (r) => ROLE_LEVEL[r] < ROLE_LEVEL[reqRole]
  );

  const roleDetails = [
    {
      role: "MEMBER" as UserRole,
      title: "Member",
      description: "Submit and track own commitments, view dashboards",
      icon: UserIcon,
    },
    {
      role: "MANAGER" as UserRole,
      title: "Manager",
      description: "Manage team commitments, meetings, and team settings",
      icon: ShieldIcon,
    },
    {
      role: "ADMIN" as UserRole,
      title: "Admin",
      description: "Full administrative access, manage members and billing",
      icon: Crown,
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md flex flex-col h-full bg-white dark:bg-zinc-950">
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle className="font-plus-jakarta font-semibold text-[15px]">
            Change role
          </SheetTitle>
          <SheetDescription className="text-xs">
            Modify authorization level for {member.name}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 px-6 py-5 overflow-y-auto flex flex-col gap-5">
          <div className="flex flex-col gap-2 w-full">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Workspace Role
            </label>
            <div className="flex flex-col gap-2 relative">
              {roleDetails
                .filter((item) => selectableRoles.includes(item.role))
                .map((item) => {
                  const isSelected = role === item.role;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.role}
                      type="button"
                      onClick={() => setRole(item.role)}
                      className={cn(
                        "group relative flex items-start gap-3.5 p-3 rounded-xl border text-left cursor-pointer outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-brand/20",
                        isSelected
                          ? "border-brand bg-brand-subtle/20"
                          : "border-border hover:border-border-strong hover:bg-surface-hover/20"
                      )}
                    >
                      {/* Highlight background capsule */}
                      {isSelected && (
                        <motion.div
                          layoutId="activeChangeRoleBg"
                          className="absolute inset-0 bg-brand-subtle/10 border border-brand rounded-xl pointer-events-none"
                          transition={{ type: "spring", stiffness: 380, damping: 30 }}
                        />
                      )}

                      {/* Icon Container */}
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-all duration-200 relative z-10",
                          isSelected
                            ? "bg-brand/10 border-brand/20 text-brand"
                            : "bg-surface border-border text-muted-foreground group-hover:text-foreground group-hover:border-border-strong"
                        )}
                      >
                        <Icon className="h-4.5 w-4.5 transition-transform duration-200 group-hover:scale-110" />
                      </div>

                      {/* Text info */}
                      <div className="flex flex-col pr-2 relative z-10">
                        <span
                          className={cn(
                            "text-xs font-semibold tracking-tight transition-colors duration-200",
                            isSelected ? "text-brand" : "text-foreground"
                          )}
                        >
                          {item.title}
                        </span>
                        <span className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                          {item.description}
                        </span>
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>

        <SheetFooter className="border-t border-border px-6 py-4 mt-auto">
          <div className="flex gap-2 w-full sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={changeRoleMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => changeRoleMutation.mutate()}
              disabled={changeRoleMutation.isPending || role === member.role}
            >
              {changeRoleMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
