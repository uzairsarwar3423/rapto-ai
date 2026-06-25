"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface UpgradeModalStubProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UpgradeModalStub({ open, onOpenChange }: UpgradeModalStubProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-md p-6 bg-white dark:bg-zinc-950 border border-border shadow-2xl font-sans rounded-xl">
        <DialogHeader className="p-0 mb-4">
          <DialogTitle className="text-base font-semibold text-foreground font-display">
            Upgrade Your Plan
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1 font-sans">
            You've hit your monthly meeting quota on the free tier. Upgrade to Pro to schedule unlimited meetings and unlock advanced AI transcripts.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-3 border-y border-border/50 my-2">
          <div className="flex justify-between items-center text-xs font-sans">
            <span className="text-muted-foreground">Current Plan</span>
            <span className="font-semibold text-foreground">Free Tier</span>
          </div>
          <div className="flex justify-between items-center text-xs font-sans">
            <span className="text-muted-foreground">Meeting Limit</span>
            <span className="font-semibold text-foreground">5 / 5 met</span>
          </div>
        </div>

        <DialogFooter className="mt-4 flex bg-white flex-row items-center justify-end gap-3">
          <DialogClose asChild>
            <Button
              type="button"
              variant="outline"
              className="h-9 text-xs bg-white dark:bg-zinc-900 border border-border"
            >
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            className="h-9 text-xs bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90 font-medium font-sans px-4"
            onClick={() => {
              // In real SaaS, route to billing/pricing
              window.location.href = "/pricing";
            }}
          >
            View Plans
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
