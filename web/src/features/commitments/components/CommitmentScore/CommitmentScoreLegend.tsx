"use client";

import React, { useState, useEffect } from "react";
import { TrendIndicator } from "../TrendIndicator";

export interface CommitmentScoreLegendProps {
  fulfillmentRate: number;
  onTimeRate: number;
  trend: "improving" | "stable" | "declining";
  weekOverWeekText?: string;
}

export function CommitmentScoreLegend({
  fulfillmentRate,
  onTimeRate,
  trend,
  weekOverWeekText,
}: CommitmentScoreLegendProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const items = [
    {
      label: "Fulfillment Rate",
      value: `${fulfillmentRate}%`,
    },
    {
      label: "On-time Delivery",
      value: `${onTimeRate}%`,
    },
    {
      label: "Performance Trend",
      custom: <TrendIndicator trend={trend} weekOverWeekText={weekOverWeekText} />,
    },
  ];

  return (
    <div className="space-y-3 font-sans text-sm">
      {items.map((item, idx) => {
        const delay = idx * 40; // 0ms, 40ms, 80ms delays
        return (
          <div
            key={idx}
            className="flex items-center justify-between gap-4 border-b border-border pb-1.5 last:border-0 last:pb-0"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0)" : "translateY(2px)",
              transition: "opacity 120ms ease-out, transform 120ms ease-out",
              transitionDelay: `${delay}ms`,
            }}
          >
            <span className="text-muted-foreground">{item.label}</span>
            {item.custom ? (
              item.custom
            ) : (
              <span className="font-mono font-medium text-foreground">
                {item.value}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
