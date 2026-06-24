"use client";

import { PanelLeftClose, PanelLeft } from "lucide-react";
import { useUIStore } from "@/store/ui.store";
import { useKeyboardShortcut } from "@/hooks/shared/useKeyboardShortcut";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Kbd } from "../Kbd";

export function SidebarCollapseButton() {
  const collapsed = useUIStore((state) => state.sidebarCollapsed);
  const toggle = useUIStore((state) => state.toggleSidebar);

  // Bind Cmd+\ (mod+\) to toggle the sidebar
  useKeyboardShortcut("mod+\\", () => {
    toggle();
  });

  const tooltipText = collapsed ? "Expand sidebar" : "Collapse sidebar";

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={toggle}
            className="flex h-8 w-8 items-center justify-center rounded-radius border border-border bg-surface text-muted-foreground hover:bg-surface-hover hover:text-foreground cursor-pointer transition-colors duration-120 outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={tooltipText}
          >
            {collapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8} className="flex items-center gap-2">
          <span className="text-[11px] font-normal">{tooltipText}</span>
          <Kbd keys={["mod", "\\"]} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
