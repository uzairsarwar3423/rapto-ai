"use client";

import React from "react";
import { ActionItemRowSkeleton } from "../ActionItemRowSkeleton";

export function ActionItemListSkeleton() {
  return (
    <div className="flex flex-col w-full border border-border/40 rounded-lg overflow-hidden bg-background">
      {/* Skeleton header */}
      <div className="h-9 border-b border-border/40 bg-muted/20 w-full flex items-center px-3 justify-between">
        <div className="h-4 w-4 bg-muted-foreground/10 rounded-sm shrink-0" />
        <div className="h-3 w-16 bg-muted-foreground/10 rounded-sm" />
        <div className="h-3 w-20 bg-muted-foreground/10 rounded-sm" />
      </div>
      {/* Skeleton rows */}
      {Array.from({ length: 8 }).map((_, index) => (
        <ActionItemRowSkeleton key={index} density="compact" />
      ))}
    </div>
  );
}
