"use client";

import React, { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { PageContainer } from "@/components/shared/layout/PageContainer";
import { PageHeader } from "@/components/shared/layout/PageHeader";

interface DashboardErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  useEffect(() => {
    console.error("Dashboard page crash:", error);
  }, [error]);

  return (
    <PageContainer>
      <PageHeader
        title="Overview"
        subtitle="Track commitments, meetings, and team performance."
      />
      <div className="flex flex-col items-center justify-center py-20 px-4 border border-dashed border-border/60 rounded-2xl bg-surface/30 text-center space-y-4">
        <div className="h-10 w-10 rounded-xl bg-error/10 text-error flex items-center justify-center">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="space-y-1 max-w-md">
          <h3 className="text-sm font-semibold text-foreground">Something went wrong</h3>
          <p className="text-xs text-muted-foreground">
            An unexpected error occurred while loading your dashboard overview. Please try reloading the page.
          </p>
        </div>
        <button
          onClick={() => reset()}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-foreground bg-surface border border-border hover:bg-surface-2 transition duration-120 cursor-pointer rounded-lg shadow-sm"
        >
          <RefreshCw className="h-3 w-3" />
          Reload dashboard
        </button>
      </div>
    </PageContainer>
  );
}
