import React from "react";
import { cn } from "@/lib/utils";

interface SidebarNavGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  collapsed: boolean;
  children: React.ReactNode;
}

/**
 * A labelled group of nav items. Expanded: a quiet uppercase label. Collapsed: the label fades out and a
 * short hairline fades in — the section boundary is preserved, the row height never changes.
 */
export function SidebarNavGroup({
  label,
  collapsed,
  children,
  className,
  ...props
}: SidebarNavGroupProps) {
  return (
    <div role="group" aria-label={label} className={cn("flex w-full flex-col", className)} {...props}>
      <div className="relative mb-1 h-7 px-3" aria-hidden="true">
        <span
          className={cn(
            "absolute inset-x-3 top-1/2 -translate-y-1/2 truncate text-[10.5px] font-medium uppercase leading-none",
            "tracking-[0.09em] text-muted-subtle select-none",
            "transition-opacity duration-150",
            collapsed ? "opacity-0" : "opacity-100 delay-75"
          )}
        >
          {label}
        </span>
        <span
          className={cn(
            "absolute left-1/2 top-1/2 h-px w-4 -translate-x-1/2 bg-border",
            "transition-opacity duration-150",
            collapsed ? "opacity-100 delay-75" : "opacity-0"
          )}
        />
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}
