"use client";

import React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { IntegrationIcon } from "./IntegrationIcon";
import { cn } from "@/lib/utils";

import { SaveStateIndicator } from "@/shared/components/feedback/SaveStateIndicator";
import { SaveState } from "@/shared/hooks/useSaveState";

interface IntegrationConfigSheetProps {
  open: boolean;
  onClose: () => void;
  providerId: string;
  providerName: string;
  state: SaveState;
  children: React.ReactNode;
}

export function IntegrationConfigSheet({
  open,
  onClose,
  providerId,
  providerName,
  state,
  children,
}: IntegrationConfigSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(val) => !val && onClose()}>
      <SheetContent
        className="sm:max-w-md flex flex-col h-full select-none bg-white dark:bg-zinc-950 p-6 sm:p-8"
        side="right"
      >
        <SheetHeader className="p-0 pb-4">
          <div className="flex items-center gap-3">
            <IntegrationIcon provider={providerId} />
            <SheetTitle className="font-heading font-semibold text-lg tracking-tight text-foreground">
              Configure {providerName}
            </SheetTitle>
          </div>
          <SheetDescription className="text-xs text-muted-foreground mt-1 font-sans">
            Manage settings and connection rules for your {providerName} integration.
          </SheetDescription>
        </SheetHeader>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto py-6 space-y-6">
          {children}
        </div>

        {/* Footer with InlineSaveState */}
        <SheetFooter className="p-0 mt-auto pt-4 flex flex-row items-center justify-end gap-3 shrink-0">
          <div className="mr-auto">
            <SaveStateIndicator state={state} />
          </div>

          <Button
            variant="outline"
            onClick={onClose}
            disabled={state === "saving"}
            className="font-sans text-xs h-9"
          >
            Close
          </Button>

          <Button
            type="submit"
            form="integration-config-form"
            disabled={state === "saving"}
            className="font-sans text-xs h-9 min-w-[80px]"
          >
            <span
              className={cn(
                "transition-opacity duration-150 ease-in-out",
                state === "saving" ? "opacity-40" : "opacity-100"
              )}
            >
              {state === "saving" ? "Saving..." : "Save"}
            </span>
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
