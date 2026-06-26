// web/src/features/team/components/MemberTable/MemberTable.tsx

"use client";

import React, { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import { useSortableColumns } from "@/shared/hooks/useSortableColumns";
import { RowEmptyState } from "@/shared/components/feedback/RowEmptyState";
import { MemberTableHeader } from "./MemberTableHeader";
import { MemberRow } from "./MemberRow";
import type { TeamMember } from "../../types/team.types";

interface MemberTableProps {
  members: TeamMember[];
  requester?: { id: string; role: string } | null;
}

export function MemberTable({ members, requester }: MemberTableProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // 1. Client-side search filter (case-insensitive name or email)
  const filteredMembers = useMemo(() => {
    return members.filter((member) => {
      const term = searchQuery.trim().toLowerCase();
      if (!term) return true;
      return (
        member.name.toLowerCase().includes(term) ||
        member.email.toLowerCase().includes(term)
      );
    });
  }, [members, searchQuery]);

  // 2. Client-side sorting hook
  const { sorted, sort, toggleSort } = useSortableColumns<TeamMember>(filteredMembers, {
    key: "commitmentScore",
    direction: "desc",
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Search Input block */}
      <div className="relative w-full max-w-sm">
        <span className="absolute inset-y-0 left-3 flex items-center text-muted-foreground pointer-events-none">
          <Search className="size-4" />
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search teammates by name or email..."
          className="h-9 w-full pl-9 pr-8 text-xs bg-surface-hover/30 hover:bg-surface-hover/50 focus:bg-background border border-border rounded-lg outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute inset-y-0 right-2.5 flex items-center text-muted-foreground hover:text-foreground outline-none"
            aria-label="Clear search"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Table Container */}
      <div className="border border-border rounded-lg bg-surface/30 overflow-hidden shadow-sm">
        {/* Table Headers */}
        <MemberTableHeader
          sortKey={sort.key}
          direction={sort.direction}
          onSort={toggleSort}
        />

        {/* Member Rows list */}
        {sorted.length > 0 ? (
          <div className="divide-y divide-border bg-background/50">
            {sorted.map((member) => (
              <MemberRow key={member.id} member={member} requester={requester} />
            ))}
          </div>
        ) : (
          <div className="p-8 bg-background/25">
            <RowEmptyState
              title="No teammates found"
              subtitle={
                searchQuery
                  ? `No members match the search term "${searchQuery}"`
                  : "Invite members to get started!"
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
