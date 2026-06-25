import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface MeetingDetailTabSectionProps {
  title: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  children: React.ReactNode;
  className?: string;
}

export function MeetingDetailTabSection({
  title,
  viewAllHref,
  viewAllLabel = "View all",
  children,
  className,
}: MeetingDetailTabSectionProps) {
  return (
    <div className={cn("flex flex-col w-full", className)}>
      <header className="flex items-center justify-between pb-2 mb-3 border-b border-border/40">
        <h2 className="font-heading text-sm font-semibold text-foreground tracking-tight select-none">
          {title}
        </h2>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className={cn(
              "group/viewall font-sans text-xs text-muted-foreground hover:text-foreground hover:underline",
              "transition-colors duration-120 flex items-center gap-1 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none rounded px-1 py-0.5"
            )}
          >
            {viewAllLabel}
            <span
              className="inline-block transition-transform duration-120 ease-out transform group-hover/viewall:translate-x-[2px]"
              aria-hidden="true"
            >
              →
            </span>
          </Link>
        )}
      </header>
      <div className="flex flex-col w-full">
        {children}
      </div>
    </div>
  );
}
