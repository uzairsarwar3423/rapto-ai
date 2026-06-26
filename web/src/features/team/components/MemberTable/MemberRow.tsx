// web/src/features/team/components/MemberTable/MemberRow.tsx

"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, ChevronRight } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ConfirmModal } from "@/shared/components/feedback/ConfirmModal";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { teamApi } from "../../api/team.api";
import { RoleBadge } from "../RoleBadge";
import { CommitmentRateBar } from "../CommitmentRateBar";
import { CommitmentScore } from "@/features/commitments/components/CommitmentScore/CommitmentScore";
import { TrendIndicator } from "@/features/commitments/components/TrendIndicator";
import { toast } from "sonner";
import { useRealtimeStore } from "@/store/realtime.store";
import type { TeamMember, UserRole } from "../../types/team.types";

interface MemberRowProps {
  member: TeamMember;
  requester?: { id: string; role: string; teamId?: string } | null;
}

interface RowAction {
  id: "change-role" | "remove";
  label: string;
  destructive?: boolean;
}

const ROLE_LEVEL: Record<string, number> = {
  OWNER: 4,
  ADMIN: 3,
  MANAGER: 2,
  MEMBER: 1,
};

export function getAvailableActions(
  target: TeamMember,
  requester: { id: string; role: string }
): RowAction[] {
  const actions: RowAction[] = [];
  if (target.role === "OWNER") return actions; // Nothing ever for owner
  if (target.id === requester.id) return actions; // Can't edit yourself

  const reqLevel = ROLE_LEVEL[requester.role] || 0;
  const targetLevel = ROLE_LEVEL[target.role] || 0;

  if (reqLevel <= targetLevel) return actions;

  actions.push({ id: "change-role", label: "Change role" });
  actions.push({ id: "remove", label: "Remove from team", destructive: true });
  return actions;
}

export function MemberRow({ member, requester: propRequester }: MemberRowProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const storeRequester = useAuthStore((state) => state.user);
  const requester = propRequester || storeRequester;

  const isFlashed = useRealtimeStore((state) => state.flashedRows.has(member.id));

  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>(member.role);

  const teamId = requester?.teamId || "";

  // 1. Mutation: Change Role
  const changeRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      teamApi.changeRole(userId, role),
    onSuccess: () => {
      toast.success(`Updated ${member.name}'s role to ${selectedRole.toLowerCase()}`);
      if (teamId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.team.members(teamId) });
      }
      setShowRoleDialog(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || "Failed to update role");
    },
  });

  // 2. Mutation: Remove Member
  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => teamApi.removeMember(userId),
    onSuccess: () => {
      toast.success(`${member.name} has been removed from the team`);
      if (teamId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.team.members(teamId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.team.health(teamId) });
      }
      setShowRemoveConfirm(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || "Failed to remove member");
    },
  });

  const actions = useMemo(() => {
    if (!requester) return [];
    return getAvailableActions(member, { id: requester.id, role: requester.role });
  }, [member, requester]);

  if (!requester) return null;

  // Filter selectable roles: requester can only assign roles STRICTLY below their own level
  const selectableRoles = Object.keys(ROLE_LEVEL).filter(
    (role) => ROLE_LEVEL[role] < ROLE_LEVEL[requester.role]
  ) as UserRole[];

  const handleRowClick = () => {
    router.push(`/team/${member.id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleRowClick();
    }
  };

  return (
    <>
      <div
        role="row"
        tabIndex={0}
        onClick={handleRowClick}
        onKeyDown={handleKeyDown}
        className={cn(
          "relative group grid grid-cols-[1fr_100px_72px_140px_180px_90px_36px] h-12 items-center px-4 text-[13px] border-b border-border hover:bg-surface-hover/30 cursor-pointer outline-none focus-visible:bg-surface-hover focus-visible:ring-1 focus-visible:ring-ring select-none transition-all duration-[1500ms] ease-out",
          isFlashed ? "bg-emerald-500/15 transition-none" : ""
        )}
      >
        {/* Profile / Avatar */}
        <div className="flex items-center gap-2.5 truncate pr-2">
          <Avatar className="size-7 shrink-0 border border-border group-hover:scale-105 transition-transform duration-200">
            <AvatarImage src={member.avatarUrl || undefined} alt={member.name} />
            <AvatarFallback className="text-[11px] font-semibold bg-muted text-muted-foreground uppercase">
              {member.name.substring(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col truncate">
            <span className="font-medium text-foreground truncate">{member.name}</span>
            <span className="text-[11px] text-muted-foreground truncate">{member.email}</span>
          </div>
        </div>

        {/* Role */}
        <div className="flex items-center">
          <RoleBadge role={member.role} />
        </div>

        {/* Score */}
        <div className="flex items-center justify-start pl-2">
          <CommitmentScore score={member.commitmentScore} size="sm" />
        </div>

        {/* Fulfillment bar */}
        <div className="flex items-center pr-4">
          <CommitmentRateBar rate={member.fulfillmentRate} />
        </div>

        {/* Ratio & counts */}
        <div className="text-right pr-6 font-mono text-[12px] text-muted-foreground">
          {member.fulfilled}/{member.total} ·{" "}
          <span className={member.missed > 0 ? "text-error" : ""}>
            {member.missed} missed
          </span>
        </div>

        {/* Trend */}
        <div className="flex items-center">
          <TrendIndicator trend={member.trend} />
        </div>

        {/* Actions Menu */}
        <div className="flex items-center justify-end">
          {actions.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => e.stopPropagation()}
                  className="size-7 hover:bg-muted focus-visible:ring-1 focus-visible:ring-ring transition-all duration-200"
                  aria-label={`Actions for ${member.name}`}
                >
                  <MoreHorizontal className="size-4 transition-transform duration-200 group-hover:rotate-90" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-40 bg-white"
                onClick={(e) => e.stopPropagation()}
              >
                {actions.map((action) => (
                  <DropdownMenuItem
                    key={action.id}
                    className={action.destructive ? "text-error focus:text-error" : ""}
                    onClick={() => {
                      if (action.id === "change-role") {
                        setSelectedRole(member.role);
                        setShowRoleDialog(true);
                      } else if (action.id === "remove") {
                        setShowRemoveConfirm(true);
                      }
                    }}
                  >
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <ChevronRight className="size-4 text-muted-foreground opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
          )}
        </div>
      </div>

      {/* Role Change Modal */}
      <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
        <DialogContent
          className="sm:max-w-md bg-white"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle className="font-heading text-[15px] font-semibold">Change role</DialogTitle>
            <DialogDescription className="text-xs">
              Select a new authorization level for <strong>{member.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 flex flex-col gap-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase">Role</label>
            <NativeSelect
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as UserRole)}
              className="w-full"
            >
              {selectableRoles.map((role) => (
                <NativeSelectOption key={role} value={role}>
                  {role.charAt(0) + role.slice(1).toLowerCase()}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <DialogFooter className="flex sm:justify-end gap-2 pt-2 bg-white border-t-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRoleDialog(false)}
              disabled={changeRoleMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() =>
                changeRoleMutation.mutate({ userId: member.id, role: selectedRole })
              }
              disabled={changeRoleMutation.isPending || selectedRole === member.role}
            >
              {changeRoleMutation.isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Eject / Remove Confirmation Modal */}
      <ConfirmModal
        open={showRemoveConfirm}
        onOpenChange={setShowRemoveConfirm}
        title="Remove member"
        description={`Are you sure you want to remove ${member.name} from the team? This action is permanent and will unassign all their pending commitments.`}
        confirmLabel="Remove member"
        variant="destructive"
        onConfirm={async () => {
          await removeMemberMutation.mutateAsync(member.id);
        }}
      />
    </>
  );
}
