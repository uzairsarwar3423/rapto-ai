"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/shared/components/feedback/ConfirmModal";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { teamApi } from "../api/team.api";
import { toast } from "sonner";
import type { TeamMember } from "../types/team.types";

interface RemoveMemberSheetProps {
  member: TeamMember;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RemoveMemberSheet({ member, open, onOpenChange }: RemoveMemberSheetProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const requester = useAuthStore((state) => state.user);
  const teamId = requester?.teamId || "";

  const [confirmOpen, setConfirmOpen] = useState(false);

  const removeMutation = useMutation({
    mutationFn: () => teamApi.removeMember(member.id),
    onSuccess: () => {
      toast.success(`${member.name} has been removed from the team`);
      if (teamId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.team.members(teamId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.team.health(teamId) });
      }
      setConfirmOpen(false);
      onOpenChange(false);
      router.push("/team");
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || "Failed to remove member");
    },
  });

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-md flex flex-col h-full bg-white dark:bg-zinc-950">
          <SheetHeader className="border-b border-border px-6 py-5">
            <SheetTitle className="font-plus-jakarta font-semibold text-[15px]">
              Remove {member.name}
            </SheetTitle>
            <SheetDescription className="text-xs">
              Teammate access management settings
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 px-6 py-5 overflow-y-auto flex flex-col gap-4">
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              They will lose access to the workspace immediately. Their past commitments and meeting history stay with the team.
            </p>
          </div>

          <SheetFooter className="border-t border-border px-6 py-4 mt-auto">
            <div className="flex gap-2 w-full sm:justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                className="bg-error hover:bg-error/90 text-white"
                onClick={() => setConfirmOpen(true)}
              >
                Remove from team
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Remove ${member.name} from the team?`}
        description={`This action is permanent. ${member.name} will lose all access to this workspace, and any pending commitments will be unassigned. This cannot be undone.`}
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={async () => {
          await removeMutation.mutateAsync();
        }}
      />
    </>
  );
}
