import React from "react";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getTeamPulse } from "../../api/dashboard.queries";
import { WidgetHeader } from "./WidgetHeader";

function TrendIcon({ trend, className }: { trend: string; className?: string }) {
  if (trend === "improving") return <ArrowUpRight className={className} />;
  if (trend === "declining") return <ArrowDownRight className={className} />;
  return <Minus className={className} />;
}

function MiniSparkline({ points, className }: { points: number[]; className?: string }) {
  const max = Math.max(...points, 1);
  const w = 96;
  const h = 32;
  const path = points
    .map((p, i) => `${(i / (points.length - 1 || 1)) * w},${h - (p / max) * h}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden="true" preserveAspectRatio="none">
      <polyline
        points={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-muted-foreground"
      />
    </svg>
  );
}

export async function TeamPulseWidget() {
  const pulse = await getTeamPulse();

  const hasData = pulse.total > 0;
  const rateLabel = hasData ? `${pulse.fulfillmentRate}%` : "—";

  return (
    <Card className="col-span-12 md:col-span-4 bg-surface border-border/60">
      <WidgetHeader title="Team pulse" actionLabel="Details" actionHref="/analytics" />
      <div className="p-5 flex flex-col justify-between h-[135px]">
        <div>
          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
            Fulfillment Rate
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl-heading font-heading font-bold tabular-nums text-foreground leading-none">
              {rateLabel}
            </span>
            {hasData && (
              <div className="flex items-center gap-0.5 text-2xs">
                <TrendIcon trend={pulse.trend} className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground capitalize">{pulse.trend}</span>
              </div>
            )}
          </div>
        </div>

        <div className="h-10 w-full mt-2 relative">
          {hasData ? (
            <div className="flex items-end justify-between w-full h-full">
              <MiniSparkline points={pulse.last7DaysPoints} className="h-10 w-24" />
            </div>
          ) : (
            <div className="flex items-center justify-start h-full">
              <span className="text-[11px] text-muted-foreground font-medium">
                Not enough data yet
              </span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
