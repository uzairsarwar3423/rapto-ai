"use client";

import { SidebarCollapseButton } from "@/components/shared/layout/Sidebar/SidebarCollapseButton";
import { Breadcrumb } from "./Breadcrumb";
import { SearchTrigger } from "./SearchTrigger";
import { TopbarActions } from "./TopbarActions";
import { NotificationBell } from "./NotificationBell";

export function Topbar() {
  return (
    <header className="flex h-topbar shrink-0 items-center justify-between border-b border-border bg-background px-4 select-none">
      <div className="flex items-center gap-3">
        <SidebarCollapseButton />
        <Breadcrumb />
      </div>

      <div className="flex-1 flex justify-center">
        <SearchTrigger />
      </div>

      <div className="flex items-center gap-2">
        <TopbarActions />
        <NotificationBell />
      </div>
    </header>
  );
}
