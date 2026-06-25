import React from "react";
import { Layers, Clock, TrendingUp, AlertTriangle } from "lucide-react";
import type { TeamStatsResponse } from "../api/commitments.queries";

export interface CommitmentStatsProps {
  stats: TeamStatsResponse["team"];
}

export function CommitmentStats({ stats }: CommitmentStatsProps) {
  const { total, fulfilled, missed, pending, fulfillmentRate } = stats;

  // Calculate missed rate relative to resolved commitments, or fallback to total
  const resolvedCount = fulfilled + missed;
  const missedRate = resolvedCount > 0 ? Math.round((missed / resolvedCount) * 100) : 0;

  const statCards = [
    {
      label: "Total Commitments",
      value: total,
      subtext: "Tracked in team meetings",
      icon: Layers,
      borderClass: "border-l-brand",
      bgClass: "bg-surface-hover/20",
      textColor: "text-foreground",
      iconColor: "text-brand",
    },
    {
      label: "Pending Overrides",
      value: pending,
      subtext: "Awaiting action items",
      icon: Clock,
      borderClass: "border-l-pending-text",
      bgClass: "bg-pending-bg/10",
      textColor: "text-pending-text",
      iconColor: "text-pending-text",
    },
    {
      label: "Fulfillment Rate",
      value: `${fulfillmentRate}%`,
      subtext: `${fulfilled} of ${resolvedCount} met`,
      icon: TrendingUp,
      borderClass: "border-l-fulfilled-text",
      bgClass: "bg-fulfilled-bg/10",
      textColor: "text-fulfilled-text",
      iconColor: "text-fulfilled-text",
    },
    {
      label: "Missed Rate",
      value: `${missedRate}%`,
      subtext: `${missed} commitments missed`,
      icon: AlertTriangle,
      borderClass: "border-l-missed-text",
      bgClass: "bg-missed-bg/10",
      textColor: "text-missed-text",
      iconColor: "text-missed-text",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-surface/30 backdrop-blur-md border border-border/60 p-4 rounded-xl shadow-xs">
      {statCards.map((card, idx) => {
        const IconComponent = card.icon;
        return (
          <div
            key={idx}
            className={`flex flex-col gap-2 p-4 rounded-lg border border-border/40 ${card.bgClass} ${card.borderClass} border-l-4 shadow-2xs hover:shadow-xs transition-all duration-160 hover:-translate-y-0.5 select-none`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/85">
                {card.label}
              </span>
              <IconComponent className={`h-4.5 w-4.5 ${card.iconColor}`} />
            </div>
            <div>
              <span className="text-2xl font-bold tracking-tight font-mono tabular-nums text-foreground">
                {card.value}
              </span>
            </div>
            <div className="text-3xs text-muted-foreground/90 font-medium">
              {card.subtext}
            </div>
          </div>
        );
      })}
    </div>
  );
}
