import React from "react";

interface DashboardGridProps {
  children: React.ReactNode;
}

export function DashboardGrid({ children }: DashboardGridProps) {
  return <div className="grid grid-cols-12 gap-4">{children}</div>;
}
