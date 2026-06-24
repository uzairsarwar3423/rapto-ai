import React from "react";
import Link from "next/link";

interface WidgetHeaderProps {
  title: string;
  actionLabel?: string;
  actionHref?: string;
}

export function WidgetHeader({ title, actionLabel, actionHref }: WidgetHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
      <h2 className="text-xs font-semibold text-foreground tracking-tight font-heading">{title}</h2>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition duration-120"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
