"use client";

import React, { useState } from "react";
import { Check, ChevronDown, Search, User } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTeamMembers } from "../../hooks/useTeamMembers";
import { cn } from "@/lib/utils";

interface OwnerFilterPopoverProps {
  selectedOwnerIds: string[];
  onSelectedOwnerIdsChange: (ids: string[]) => void;
}

export function OwnerFilterPopover({
  selectedOwnerIds,
  onSelectedOwnerIdsChange,
}: OwnerFilterPopoverProps) {
  const { data: members = [], isLoading } = useTeamMembers();
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const filteredMembers = members.filter((member) =>
    member.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleToggle = (memberId: string) => {
    if (selectedOwnerIds.includes(memberId)) {
      onSelectedOwnerIdsChange(selectedOwnerIds.filter((id) => id !== memberId));
    } else {
      onSelectedOwnerIdsChange([...selectedOwnerIds, memberId]);
    }
  };

  const selectedCount = selectedOwnerIds.length;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-medium font-sans transition-all duration-120 cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-ring",
            selectedCount > 0
              ? "border-brand/35 bg-brand/5 text-brand hover:bg-brand/10"
              : "border-border bg-card text-muted-foreground hover:bg-surface-hover hover:text-foreground"
          )}
        >
          <span>Owner</span>
          {selectedCount > 0 && (
            <span className="font-mono text-2xs font-semibold tabular-nums">
              ({selectedCount})
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0 bg-white dark:bg-zinc-950 border border-border shadow-md rounded-lg overflow-hidden font-sans">
        {isLoading ? (
          <div className="flex items-center justify-center p-6 text-xs text-muted-foreground">
            Loading members...
          </div>
        ) : (
          <div className="flex flex-col max-h-72">
            {/* Search Input for > 8 members */}
            {members.length > 8 && (
              <div className="flex items-center border-b border-border px-2.5 py-2">
                <Search className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search members..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground/60 text-foreground"
                />
              </div>
            )}

            {/* Members List */}
            <div className="flex-1 overflow-y-auto p-1 divide-y divide-border/20">
              {filteredMembers.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  No members found
                </div>
              ) : (
                filteredMembers.map((member) => {
                  const isChecked = selectedOwnerIds.includes(member.id);
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => handleToggle(member.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-xs font-sans hover:bg-surface-hover/80 transition-colors duration-100 cursor-pointer select-none",
                        isChecked && "bg-brand/5"
                      )}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => handleToggle(member.id)}
                        tabIndex={-1}
                        className="pointer-events-none"
                      />
                      <Avatar className="h-5 w-5">
                        {member.avatarUrl ? (
                          <AvatarImage src={member.avatarUrl} alt={member.name} />
                        ) : (
                          <AvatarFallback className="bg-muted text-2xs text-muted-foreground">
                            {member.name.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <span className="flex-1 truncate font-medium text-foreground">
                        {member.name}
                      </span>
                      {isChecked && <Check className="h-3.5 w-3.5 text-brand shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
