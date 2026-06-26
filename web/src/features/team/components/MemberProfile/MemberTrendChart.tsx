"use client";

import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemberTrend } from "../../hooks/useMemberTrend";
import { buildSparklinePath } from "../../lib/sparkline-path";

interface MemberTrendChartProps {
  memberId: string;
}

export function MemberTrendChart({ memberId }: MemberTrendChartProps) {
  const { data, isPending } = useMemberTrend(memberId);

  if (isPending) {
    return (
      <div className="flex items-center gap-3 h-12">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-10" />
        </div>
        <Skeleton className="h-[32px] w-[120px]" />
      </div>
    );
  }

  const points = data?.points || [];
  const values = points.map((p: any) => p.value);
  const currentRate = values.length > 0 ? values[values.length - 1] : 0;

  // Use sparkline builder
  const { path } = buildSparklinePath(values, 120, 32, 4);

  return (
    <section id="trends" className="scroll-mt-20">
      <div className="flex items-center justify-between p-5 rounded-2xl border border-border bg-surface-card shadow-sm select-none">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-plus-jakarta font-semibold text-muted-foreground tracking-wider">
            Fulfillment Trend
          </span>
          <span className="text-2xl font-poppins font-semibold text-foreground mt-0.5 leading-none">
            {currentRate}%
          </span>
        </div>
        
        {values.length > 0 ? (
          <div className="relative">
            <svg className="w-[120px] h-[32px] overflow-visible">
              <path
                d={path}
                fill="none"
                stroke="var(--color-brand)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">No trend data available</span>
        )}
      </div>
    </section>
  );
}
