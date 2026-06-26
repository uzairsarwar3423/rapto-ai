// web/src/features/team/components/MemberTable/MemberTableHeader.tsx

import React from "react";
import { SortableColumnHeader } from "@/shared/components/data-display/SortableColumnHeader";
import type { TeamMember } from "../../types/team.types";

interface MemberTableHeaderProps {
  sortKey: keyof TeamMember;
  direction: "asc" | "desc";
  onSort: (key: keyof TeamMember) => void;
}

export function MemberTableHeader({ sortKey, direction, onSort }: MemberTableHeaderProps) {
  return (
    <div className="grid grid-cols-[1fr_100px_72px_140px_180px_90px_36px] h-10 items-center px-4 border-b border-border bg-surface-hover/30 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider select-none">
      <div>
        <SortableColumnHeader<TeamMember>
          label="Teammate"
          sortKey="name"
          activeSortKey={sortKey}
          direction={direction}
          onSort={onSort}
        />
      </div>
      <div>
        <SortableColumnHeader<TeamMember>
          label="Role"
          sortKey="role"
          activeSortKey={sortKey}
          direction={direction}
          onSort={onSort}
        />
      </div>
      <div>
        <SortableColumnHeader<TeamMember>
          label="Score"
          sortKey="commitmentScore"
          activeSortKey={sortKey}
          direction={direction}
          onSort={onSort}
        />
      </div>
      <div>
        <SortableColumnHeader<TeamMember>
          label="Fulfillment"
          sortKey="fulfillmentRate"
          activeSortKey={sortKey}
          direction={direction}
          onSort={onSort}
        />
      </div>
      <div className="text-right pr-4">
        <SortableColumnHeader<TeamMember>
          label="Activity"
          sortKey="total"
          activeSortKey={sortKey}
          direction={direction}
          onSort={onSort}
          className="ml-auto"
        />
      </div>
      <div>
        <SortableColumnHeader<TeamMember>
          label="Trend"
          sortKey="trend"
          activeSortKey={sortKey}
          direction={direction}
          onSort={onSort}
        />
      </div>
      <div className="text-right text-[10px] pr-2">Actions</div>
    </div>
  );
}
