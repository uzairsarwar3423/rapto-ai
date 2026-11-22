"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useUIStore } from "@/store/ui.store";
import { useKeyboardShortcut } from "@/hooks/shared/useKeyboardShortcut";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Kbd } from "../Kbd";

/**
 * Compact collapse / expand control for the sidebar header. Owns the ⌘\ (Ctrl+\) shortcut, so it
 * must be mounted exactly once (it lives in <Sidebar />).
 */
export function SidebarCollapseButton({ className }: { className?: string }) {
  const collapsed = useUIStore((state) => state.sidebarCollapsed);
  const toggle = useUIStore((state) => state.toggleSidebar);

  useKeyboardShortcut("mod+\\", () => {
    toggle();
  });

  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={toggle}
          aria-label={label}
          aria-pressed={collapsed}
          className={cn(
            "flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none",
            "transition-[background-color,color,transform] duration-150 ease-out-soft",
            "hover:bg-foreground/[0.06] hover:text-foreground active:scale-90",
            "focus-visible:ring-2 focus-visible:ring-brand/40",
            className
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} className="gap-2 px-2.5 py-1 text-[11.5px] font-medium">
        <span>{label}</span>
        <Kbd keys={["mod", "\\"]} />
      </TooltipContent>
    </Tooltip>
  );
}
