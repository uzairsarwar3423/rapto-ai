// web/src/features/team/components/RoleBadge.tsx

import React from "react";
import { Badge } from "@/components/ui/badge";
import type { UserRole } from "../types/team.types";

interface RoleBadgeProps {
  role: UserRole;
}

export function RoleBadge({ role }: RoleBadgeProps) {
  // Normalize display: lowercase then capitalize, or just display the exact enum
  const displayRole = role.charAt(0) + role.slice(1).toLowerCase();

  return (
    <Badge
      variant="outline"
      className="font-sans font-medium text-[11px] uppercase tracking-wider px-2 py-0.5"
    >
      {displayRole}
    </Badge>
  );
}
