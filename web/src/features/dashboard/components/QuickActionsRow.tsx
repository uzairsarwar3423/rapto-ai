"use client";

import React, { useState } from "react";
import { Plus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddMeetingModal } from "@/features/meetings/components/AddMeetingModal";
import { AddMeetingTooltip } from "@/features/meetings/components/AddMeetingTooltip";
import { useUIStore } from "@/store/ui.store";

export function QuickActionsRow() {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const setInviteModalOpen = useUIStore((state) => state.setInviteModalOpen);

  return (
    <>
      <div className="flex items-center gap-2">
        <AddMeetingTooltip>
          <Button
            size="sm"
            onClick={() => setAddModalOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add meeting</span>
          </Button>
        </AddMeetingTooltip>
        <Button
          size="sm"
          onClick={() => setInviteModalOpen(true)}
        >
          <UserPlus className="h-3.5 w-3.5" />
          <span>Invite teammate</span>
        </Button>
      </div>
      <AddMeetingModal open={addModalOpen} onOpenChange={setAddModalOpen} />
    </>
  );
}
