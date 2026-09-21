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
            variant="outline"
            onClick={() => setAddModalOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" /> Add meeting
          </Button>
        </AddMeetingTooltip>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setInviteModalOpen(true)}
        >
          <UserPlus className="h-3.5 w-3.5" /> Invite teammate
        </Button>
      </div>
      <AddMeetingModal open={addModalOpen} onOpenChange={setAddModalOpen} />
    </>
  );
}
