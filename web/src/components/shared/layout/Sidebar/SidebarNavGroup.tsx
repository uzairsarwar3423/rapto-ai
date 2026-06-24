import React from "react";
import { cn } from "@/lib/utils";

interface SidebarNavGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  collapsed: boolean;
  children: React.ReactNode;
}

export function SidebarNavGroup({
  label,
  collapsed,
  children,
  className,
  ...props
}: SidebarNavGroupProps) {
  return (
    <div className={cn("flex flex-col gap-1 w-full", className)} {...props}>
      {!collapsed && (
        <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-subtle select-none">
          {label}
        </div>
      )}
      <div className={cn("flex flex-col gap-0.5", collapsed && "items-center")}>
        {children}
      </div>
    </div>
  );
}
