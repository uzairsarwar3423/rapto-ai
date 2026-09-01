import React from 'react';

interface TeamSlugFieldProps {
  slug: string;
}

export function TeamSlugField({ slug }: TeamSlugFieldProps) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-semibold text-foreground uppercase tracking-wider block">
        Team URL
      </span>
      <div className="flex items-center min-h-[42px] px-3.5 sm:px-4 rounded-xl border border-border bg-muted/40 text-xs sm:text-sm font-sans text-muted-foreground cursor-not-allowed select-none overflow-hidden">
        <span className="text-muted-foreground/60 shrink-0">app.rapto.cloud/teams/</span>
        <span className="font-medium text-foreground/80 truncate min-w-0">{slug}</span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-normal">
        Changing your team URL isn't supported yet, since it would break existing invitation links and API integrations.
      </p>
    </div>
  );
}
