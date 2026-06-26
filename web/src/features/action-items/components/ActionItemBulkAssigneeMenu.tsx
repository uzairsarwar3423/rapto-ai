"use client";

import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { User, Search } from "lucide-react";
import { useTeamMembers } from "@/features/commitments/hooks/useTeamMembers";

interface ActionItemBulkAssigneeMenuProps {
  onSelect: (assigneeId: string | null) => void;
}

export function ActionItemBulkAssigneeMenu({ onSelect }: ActionItemBulkAssigneeMenuProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: teamMembers = [] } = useTeamMembers();

  const filteredMembers = teamMembers.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-300 hover:text-zinc-50 hover:bg-zinc-800">
          <User className="h-3.5 w-3.5 mr-1 shrink-0" />
          Assignee
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        className="w-56 p-1 bg-zinc-950 border border-zinc-800 text-zinc-50 rounded-md shadow-md z-50 pointer-events-auto"
      >
        <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-zinc-800 mb-1">
          <Search className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
          <input
            type="text"
            placeholder="Search members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-xs text-zinc-50 focus:outline-none border-none p-0"
            autoFocus
          />
        </div>
        <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              setOpen(false);
            }}
            className="text-left text-xs px-2 py-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-50 transition-colors italic"
          >
            Unassigned
          </button>
          {filteredMembers.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => {
                onSelect(member.id);
                setOpen(false);
              }}
              className="text-left text-xs px-2 py-1.5 rounded hover:bg-zinc-800 text-zinc-300 hover:text-zinc-50 transition-colors"
            >
              {member.name}
            </button>
          ))}
          {filteredMembers.length === 0 && (
            <span className="text-[11px] text-zinc-500 text-center py-2">No members found</span>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
