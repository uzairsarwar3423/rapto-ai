"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
} from "@/components/ui/command";
import { useUIStore } from "@/store/ui.store";
import { useKeyboardShortcut } from "@/hooks/shared/useKeyboardShortcut";
import { navigateCommands, actionCommands, type CommandItem } from "./commandMenu.registry";
import { CommandMenuItem } from "./CommandMenuItem";
import { useIntegrations } from "@/features/integrations/hooks/useIntegrations";
import { INTEGRATION_PROVIDERS } from "@/features/integrations/data/providers.config";
import { MessageSquare, Layers, Database, CheckSquare, Calendar, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const PROVIDER_ICON_MAP: Record<string, any> = {
  SLACK: MessageSquare,
  JIRA: Layers,
  LINEAR: CheckSquare,
  NOTION: Database,
  GOOGLE_CALENDAR: Calendar,
  GOOGLE_MEET: Calendar,
};

export function CommandMenu() {
  const router = useRouter();
  const open = useUIStore((state) => state.commandMenuOpen);
  const setOpen = useUIStore((state) => state.setCommandMenuOpen);
  const toggle = useUIStore((state) => state.toggleCommandMenu);

  const { data: integrationsData } = useIntegrations();

  // Bind Mod+K (Cmd+K on Mac, Ctrl+K on Windows/Linux) to toggle command menu
  useKeyboardShortcut("mod+k", () => {
    toggle();
  });

  const handleSelect = (cmd: CommandItem) => {
    cmd.perform(router);
    setOpen(false);
  };

  const dynamicCommands: CommandItem[] = [];

  if (integrationsData) {
    const { teamIntegrations = [], userIntegrations = [] } = integrationsData;

    INTEGRATION_PROVIDERS.filter((p) => !p.comingSoon).forEach((p) => {
      const isCalendar = p.scope === "personal";
      const conn = isCalendar
        ? userIntegrations.find((u) => u.provider === p.id)
        : teamIntegrations.find((t) => t.provider === p.id);

      const Icon = PROVIDER_ICON_MAP[p.id] || Calendar;

      if (conn?.isActive) {
        dynamicCommands.push({
          id: `cmd-configure-${p.id.toLowerCase()}`,
          label: `Configure ${p.name}`,
          group: "Actions",
          icon: Icon,
          synonyms: [...p.synonyms],
          perform: (r) => r.push(`/settings/integrations?configure=${p.id.toLowerCase()}`),
        });
        dynamicCommands.push({
          id: `cmd-test-${p.id.toLowerCase()}`,
          label: `Test ${p.name} connection`,
          group: "Actions",
          icon: RefreshCw,
          synonyms: [...p.synonyms, "test", "check", "verify"],
          perform: (r) => {
            r.push(`/settings/integrations?test=${p.id.toLowerCase()}`);
          },
        });
      } else {
        dynamicCommands.push({
          id: `cmd-connect-${p.id.toLowerCase()}`,
          label: `Connect ${p.name}`,
          group: "Actions",
          icon: Icon,
          synonyms: [...p.synonyms, "install", "enable", "setup"],
          perform: (r) => r.push(`/settings/integrations`),
        });
      }
    });
  }

  const allActionCommands = [...actionCommands, ...dynamicCommands];

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {navigateCommands.map((cmd) => (
            <CommandMenuItem
              key={cmd.id}
              cmd={cmd}
              onSelect={() => handleSelect(cmd)}
            />
          ))}
        </CommandGroup>
        {allActionCommands.length > 0 && (
          <CommandGroup heading="Actions">
            {allActionCommands.map((cmd) => (
              <CommandMenuItem
                key={cmd.id}
                cmd={cmd}
                onSelect={() => handleSelect(cmd)}
              />
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
