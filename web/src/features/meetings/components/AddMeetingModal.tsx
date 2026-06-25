"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AddMeetingForm } from "./AddMeetingForm";
import { UpgradeModalStub } from "@/shared/components/feedback/UpgradeModalStub";

interface AddMeetingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddMeetingModal({ open, onOpenChange }: AddMeetingModalProps) {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const handleSuccess = () => {
    onOpenChange(false);
  };

  const handlePlanLimitHit = () => {
    setShowUpgradeModal(true);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full sm:max-w-[480px] p-6 bg-white dark:bg-zinc-950 border border-border shadow-2xl font-sans rounded-xl overflow-hidden flex flex-col max-h-[90vh]">
          <DialogHeader className="p-0 mb-6 shrink-0">
            <DialogTitle className="text-base font-semibold text-foreground font-heading">
              Add meeting
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1 font-sans">
              Schedule a new meeting for AI transcribing. Recall.ai will automatically join 2 minutes prior to start.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1 min-h-0">
            <AddMeetingForm
              onSuccess={handleSuccess}
              onPlanLimitHit={handlePlanLimitHit}
              onCancel={handleCancel}
            />
          </div>
        </DialogContent>
      </Dialog>

      <UpgradeModalStub open={showUpgradeModal} onOpenChange={setShowUpgradeModal} />
    </>
  );
}
