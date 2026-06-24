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

export function CommandMenu() {
  const router = useRouter();
  const open = useUIStore((state) => state.commandMenuOpen);
  const setOpen = useUIStore((state) => state.setCommandMenuOpen);
  const toggle = useUIStore((state) => state.toggleCommandMenu);

  // Bind Mod+K (Cmd+K on Mac, Ctrl+K on Windows/Linux) to toggle command menu
  useKeyboardShortcut("mod+k", () => {
    toggle();
  });

  const handleSelect = (cmd: CommandItem) => {
    cmd.perform(router);
    setOpen(false);
  };

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
        <CommandGroup heading="Actions">
          {actionCommands.map((cmd) => (
            <CommandMenuItem
              key={cmd.id}
              cmd={cmd}
              onSelect={() => handleSelect(cmd)}
            />
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
