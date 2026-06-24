"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Breadcrumb as BreadcrumbRoot,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import React from "react";

const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  meetings: "Meetings",
  commitments: "Commitments",
  "action-items": "Action Items",
  team: "Team",
  analytics: "Analytics",
  intelligence: "Intelligence",
  settings: "Settings",
};

export function Breadcrumb() {
  const pathname = usePathname();

  // Split and filter segments
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <BreadcrumbRoot>
      <BreadcrumbList>
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;
          const href = "/" + segments.slice(0, index + 1).join("/");

          // Parse label
          let label = ROUTE_LABELS[segment] || segment;

          // If it looks like a database ID, render a generic fallback
          if (segment.startsWith("mtg_")) {
            label = "Meeting Detail";
          } else if (segment.startsWith("com_")) {
            label = "Commitment Detail";
          } else if (segment.startsWith("act_")) {
            label = "Action Item";
          } else if (/^[0-9a-fA-F-]{36}$/.test(segment)) {
            // UUID fallback
            label = "Detail";
          }

          // Capitalize first letter of unknown labels
          if (!ROUTE_LABELS[segment] && label === segment) {
            label = segment.charAt(0).toUpperCase() + segment.slice(1);
          }

          return (
            <React.Fragment key={href}>
              {index > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="text-xs font-medium text-foreground select-none">
                    {label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link
                      href={href}
                      className="text-xs font-normal text-muted-foreground hover:text-foreground transition-colors duration-120"
                    >
                      {label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </BreadcrumbRoot>
  );
}
