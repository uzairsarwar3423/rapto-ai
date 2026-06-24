"use client";

import dynamic from "next/dynamic";
import { SidebarProvider } from "./Sidebar/SidebarProvider";
import { Sidebar } from "./Sidebar/Sidebar";
import { Topbar } from "./Topbar/Topbar";
import { ScrollArea } from "@/components/ui/scroll-area";

// Code-split the command menu palette so it's loaded lazy-loaded on the client on-demand (Cmd+K).
const CommandMenu = dynamic(
  () => import("./CommandMenu/CommandMenu").then((m) => m.CommandMenu),
  { ssr: false }
);

import { User } from "@/features/auth/types/auth.types";

interface Team {
  id: string;
  name: string;
  logo?: string;
  plan?: string;
}

interface AppShellProps {
  user: User | null;
  team: Team | null;
  defaultCollapsed: boolean;
  children: React.ReactNode;
}

export function AppShell({
  user,
  team,
  defaultCollapsed,
  children,
}: AppShellProps) {
  return (
    <SidebarProvider defaultCollapsed={defaultCollapsed}>
      <div className="dashboard-theme flex h-dvh w-screen overflow-hidden bg-background">
        <Sidebar user={user} team={team} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar />
          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <main className="min-h-full">{children}</main>
            </ScrollArea>
          </div>
        </div>
      </div>
      <CommandMenu />
    </SidebarProvider>
  );
}
