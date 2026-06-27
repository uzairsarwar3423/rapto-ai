"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IntegrationIcon } from "./IntegrationIcon";
import { useOAuthConnect } from "../hooks/useOAuthConnect";
import { cn } from "@/lib/utils";

interface ConnectIntegrationSheetProps {
  open: boolean;
  onClose: () => void;
  provider: {
    id: string;
    name: string;
    consentCopy: string;
    docsUrl: string;
  } | null;
}

export function ConnectIntegrationSheet({ open, onClose, provider }: ConnectIntegrationSheetProps) {
  const { connect, connectingProvider } = useOAuthConnect();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    if (!open) {
      setIsRedirecting(false);
    }
  }, [open]);

  if (!provider) return null;

  const handleConnect = async () => {
    setIsRedirecting(true);
    // Small fade delay simulation before location change
    setTimeout(async () => {
      await connect(provider.id);
    }, 150);
  };

  const isPending = isRedirecting || connectingProvider === provider.id;

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-zinc-950 p-6 flex flex-col select-none rounded-xl">
        <DialogHeader className="pb-4">
          <div className="flex items-center gap-3">
            <IntegrationIcon provider={provider.id} />
            <DialogTitle className="font-heading font-semibold text-lg tracking-tight text-foreground">
              Connect {provider.name}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            Authorize Vocaply to access your workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="py-6 space-y-4">
          <p className="text-[13px] font-sans font-normal text-muted-foreground/80 leading-[20px]">
            {provider.consentCopy}
          </p>
          <p className="text-[13px] font-sans font-normal text-muted-foreground/60 leading-[20px]">
            By connecting, you agree to allow Vocaply to access resources according to our privacy policy. Read the{" "}
            <a
              href={provider.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline transition-all"
            >
              documentation
            </a>{" "}
            to learn more.
          </p>
        </div>

        <DialogFooter className="-mx-6 -mb-6 mt-6 p-6 bg-white dark:bg-zinc-950 rounded-b-xl border-t-0 flex flex-row justify-end gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isPending}
            className="font-sans text-xs h-9"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConnect}
            disabled={isPending}
            className="font-sans text-xs h-9 min-w-[120px]"
          >
            <span
              className={cn(
                "transition-opacity duration-150 ease-in-out",
                isPending ? "opacity-40" : "opacity-100"
              )}
            >
              {isPending ? "Redirecting..." : `Connect ${provider.name}`}
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
