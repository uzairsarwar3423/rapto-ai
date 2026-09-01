"use client";

import React from "react";

export function MeetingListHeader() {
  return (
    <div className="hidden sm:grid sm:grid-cols-[28px_1fr_110px_110px_48px] md:grid-cols-[28px_1fr_110px_125px_110px_48px] lg:grid-cols-[28px_1fr_120px_135px_140px_56px] gap-3 items-center px-4 py-2.5 bg-muted/20 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-sans select-none">
      <div className="w-3" />
      <div className="text-left">Title</div>
      <div className="text-left">Platform</div>
      <div className="text-left">Scheduled</div>
      <div className="hidden md:block text-right">Intelligence</div>
      <div className="text-right sr-only">Actions</div>
    </div>
  );
}
