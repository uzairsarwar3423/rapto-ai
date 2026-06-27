"use client";

import { CommandItem } from "@/components/ui/command";
import { Kbd } from "../Kbd";
import { type CommandItem as RegistryCommandItem } from "./commandMenu.registry";

interface Props {
  cmd: RegistryCommandItem;
  onSelect: () => void;
}
console.log("hello-worrld")
export function CommandMenuItem({ cmd, onSelect }: Props) {
  const Icon = cmd.icon;

  return (
    <CommandItem
      onSelect={onSelect}
      value={`${cmd.label} ${cmd.synonyms?.join(" ") || ""}`.trim()}
    >
      <Icon className="mr-2 h-4 w-4 text-muted-foreground group-data-selected/command-item:text-foreground" />
      <span>{cmd.label}</span>
      {cmd.shortcut && (
        <span className="ml-auto">
          <Kbd keys={cmd.shortcut} />
        </span>
      )}
    </CommandItem>
  );
}
