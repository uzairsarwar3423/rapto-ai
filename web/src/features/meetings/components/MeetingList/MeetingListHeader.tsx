"use client";

import React from "react";

export function MeetingListHeader() {
  return (
    <div className="grid grid-cols-[24px_1fr_90px_48px] sm:grid-cols-[24px_1fr_110px_110px_48px] md:grid-cols-[24px_1fr_110px_125px_100px_48px] gap-3 items-center px-4 py-2 bg-muted/20 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-sans select-none">
      <div className="w-3" />
      <div>Title</div>
      <div className="hidden sm:block">Platform</div>
      <div className="text-left">Scheduled</div>
      <div className="hidden md:block text-right">Insights</div>
      <div className="text-right"></div>
    </div>
  );
}
