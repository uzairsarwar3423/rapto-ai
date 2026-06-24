"use client";

import { Search } from "lucide-react";
import { useUIStore } from "@/store/ui.store";
import { Kbd } from "../Kbd";

export function SearchTrigger() {
  const openCommandMenu = useUIStore((state) => state.toggleCommandMenu);

  return (
    <button
      onClick={openCommandMenu}
      className="flex h-8 w-[240px] md:w-[280px] items-center justify-between rounded-radius
                 border border-border bg-surface px-3 text-xs text-muted-foreground
                 hover:border-border-strong transition-colors duration-120 cursor-pointer outline-hidden
                 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label="Open search palette"
    >
      <span className="flex items-center gap-2">
        <Search className="h-3.5 w-3.5" /> Search everything…
      </span>
      <Kbd keys={["mod", "K"]} />
    </button>
  );
}
