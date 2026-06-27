"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { IntegrationIcon } from "./IntegrationIcon";
import { IntegrationStatusBadge, IntegrationBadgeStatus } from "./IntegrationStatusBadge";
import { IntegrationRowMenu } from "./IntegrationRowMenu";
import { RelativeTime } from "@/shared/components/data-display/RelativeTime";

interface IntegrationRowProps {
  providerId: string;
  name: string;
  description: string;
  status: IntegrationBadgeStatus;
  lastSyncedAt: string | null;
  comingSoon?: boolean;
  onConnect: () => void;
  onConfigure: () => void;
  onTest: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  isTesting: boolean;
  isDisconnecting: boolean;
  error?: string;
  successMessage?: string;
}

export function IntegrationRow({
  providerId,
  name,
  description,
  status,
  lastSyncedAt,
  comingSoon = false,
  onConnect,
  onConfigure,
  onTest,
  onReconnect,
  onDisconnect,
  isTesting,
  isDisconnecting,
  error,
  successMessage,
}: IntegrationRowProps) {
  const isSyncing = status === "SYNCING";
  const needsReauth = status === "NEEDS_REAUTH";
  const isConnected = status === "CONNECTED";
  const isNotConnected = status === "NOT_CONNECTED";

  const handleClick = () => {
    if (comingSoon || isSyncing) return;
    if (isNotConnected) {
      onConnect();
    } else {
      onConfigure();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (comingSoon || isSyncing) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      role={comingSoon ? undefined : "button"}
      tabIndex={comingSoon || isSyncing ? undefined : 0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "grid grid-cols-[24px_1fr_auto_auto_32px] items-center gap-3 px-4 py-3 select-none",
        "focus-visible:outline-none focus-visible:bg-muted/40",
        comingSoon
          ? "opacity-50 cursor-not-allowed"
          : isSyncing
          ? "cursor-not-allowed"
          : "cursor-pointer hover:bg-muted/40 transition-colors duration-100 ease-linear"
      )}
      aria-label={`${name}, ${comingSoon ? "Coming Soon" : status.replace("_", " ").toLowerCase()}${
        lastSyncedAt && isConnected ? `, last synced ${lastSyncedAt}` : ""
      }`}
    >
      {/* Col 1: Icon */}
      <IntegrationIcon provider={providerId} />

      {/* Col 2: Info (Truncated description) */}
      <div className="flex flex-col min-w-0">
        <span className="text-[13px] font-sans font-medium text-foreground leading-[20px]">
          {name}
        </span>
        <span className="text-[12px] font-sans font-normal text-muted-foreground/60 leading-[18px] truncate">
          {description}
        </span>
      </div>

      {/* Col 3: Status Badge */}
      <div className="flex items-center">
        {comingSoon ? (
          <span className="text-[10px] font-sans font-normal text-muted-foreground/50 border border-muted/20 px-1.5 py-0.5 rounded-md uppercase tracking-wider bg-muted/10">
            Soon
          </span>
        ) : (
          <IntegrationStatusBadge status={status} />
        )}
      </div>

      {/* Col 4: Secondary Content */}
      <div className="flex items-center pl-2">
        {!comingSoon && (
          <>
            {isConnected && lastSyncedAt && (
              <span className="text-[12px] font-sans font-normal text-muted-foreground/50 tabular-nums">
                Last synced <RelativeTime date={lastSyncedAt} />
              </span>
            )}
            {isSyncing && (
              <span className="text-[12px] font-sans font-normal text-muted-foreground/50 tabular-nums">
                Syncing…
              </span>
            )}
            {needsReauth && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onReconnect();
                }}
                className="text-[12px] font-sans font-medium text-primary hover:underline transition-colors focus:outline-none"
              >
                Reconnect
              </button>
            )}
          </>
        )}
      </div>

      {/* Col 5: Menu */}
      <div className="flex items-center justify-end">
        {!comingSoon && !isNotConnected && (
          <IntegrationRowMenu
            status={status}
            onConfigure={onConfigure}
            onTest={onTest}
            onReconnect={onReconnect}
            onDisconnect={onDisconnect}
            isTesting={isTesting}
            isDisconnecting={isDisconnecting}
          />
        )}
      </div>

      {/* Row Error - Spans columns starting from column 2 (below name/desc) */}
      {error && (
        <div className="col-start-2 col-end-6 mt-1 text-[11px] font-sans font-medium text-destructive animate-in fade-in duration-150">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="col-start-2 col-end-6 mt-1 text-[11px] font-sans font-medium text-emerald-600 animate-in fade-in duration-150">
          {successMessage}
        </div>
      )}
    </div>
  );
}
