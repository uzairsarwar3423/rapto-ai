"use client";

import React from "react";
import { MoreHorizontal, RefreshCw, Settings, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface IntegrationRowMenuProps {
  status: "NOT_CONNECTED" | "CONNECTED" | "NEEDS_REAUTH" | "SYNCING";
  onConfigure: () => void;
  onTest: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  isTesting: boolean;
  isDisconnecting: boolean;
}

export function IntegrationRowMenu({
  status,
  onConfigure,
  onTest,
  onReconnect,
  onDisconnect,
  isTesting,
  isDisconnecting,
}: IntegrationRowMenuProps) {
  const isSyncing = status === "SYNCING";
  const needsReauth = status === "NEEDS_REAUTH";
  const isDisabled = isTesting || isDisconnecting;

  const menuTrigger = (
    <Button
      variant="outline"
      size="icon"
      className="w-8 h-8 rounded-lg border-muted/30 hover:bg-muted/40 hover:text-foreground shrink-0 focus-visible:ring-1 transition-colors duration-100"
      disabled={isSyncing || isDisabled}
      onClick={(e) => e.stopPropagation()}
    >
      <MoreHorizontal className="w-4 h-4" />
      <span className="sr-only">Open actions</span>
    </Button>
  );

  return (
    <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
      {isSyncing ? (
        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>{menuTrigger}</TooltipTrigger>
            <TooltipContent side="left" className="text-xs font-sans">
              Available once sync completes
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>{menuTrigger}</DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 select-none font-sans bg-white dark:bg-zinc-950">
            <DropdownMenuItem
              onClick={onConfigure}
              className="text-xs flex items-center gap-2 cursor-pointer font-sans"
            >
              <Settings className="w-3.5 h-3.5" />
              Configure
            </DropdownMenuItem>

            {!needsReauth && (
              <DropdownMenuItem
                onClick={onTest}
                disabled={isDisabled}
                className="text-xs flex items-center gap-2 cursor-pointer font-sans"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isTesting && "animate-spin")} />
                Test Connection
              </DropdownMenuItem>
            )}

            <DropdownMenuItem
              onClick={onReconnect}
              className="text-xs flex items-center gap-2 cursor-pointer font-sans"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reconnect
            </DropdownMenuItem>

            <DropdownMenuSeparator className="bg-muted/10" />

            <DropdownMenuItem
              onClick={onDisconnect}
              className="text-xs text-muted-foreground focus:bg-transparent focus:text-destructive hover:text-destructive flex items-center gap-2 cursor-pointer font-sans transition-colors"
            >
              <Unlink className="w-3.5 h-3.5" />
              Disconnect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
