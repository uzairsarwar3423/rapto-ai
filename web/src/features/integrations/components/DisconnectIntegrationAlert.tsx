"use client";

import React from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

interface DisconnectIntegrationAlertProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  providerName: string;
  consequence: string;
  isPending: boolean;
}

export function DisconnectIntegrationAlert({
  open,
  onClose,
  onConfirm,
  providerName,
  consequence,
  isPending,
}: DisconnectIntegrationAlertProps) {
  return (
    <AlertDialog open={open} onOpenChange={(val) => !val && onClose()}>
      <AlertDialogContent className="max-w-md font-sans select-none">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading font-semibold text-base text-foreground tracking-tight">
            Disconnect {providerName}?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs text-muted-foreground mt-2 font-sans leading-normal">
            {consequence}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-4 gap-2">
          <AlertDialogCancel
            onClick={onClose}
            disabled={isPending}
            className="text-xs font-sans h-9"
            autoFocus
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={isPending}
            className="text-xs font-sans h-9 bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? "Disconnecting..." : "Disconnect"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
