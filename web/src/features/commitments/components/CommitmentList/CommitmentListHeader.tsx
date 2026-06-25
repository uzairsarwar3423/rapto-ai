import React from "react";

export function CommitmentListHeader() {
  return (
    <div className="flex items-center justify-between border-b border-border/60 bg-muted/20 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80 font-sans select-none shrink-0 border-l-3 border-l-transparent">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className="w-[76px] shrink-0">Status</span>
        <span>Commitment Details</span>
      </div>
      <div className="flex items-center gap-5 shrink-0 pr-0.5">
        <span className="w-24 text-right">Due Date</span>
        <span className="w-6 text-center">Owner</span>
      </div>
    </div>
  );
}
