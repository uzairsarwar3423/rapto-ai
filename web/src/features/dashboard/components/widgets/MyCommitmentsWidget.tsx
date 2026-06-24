import React from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getMyCommitments } from "../../api/dashboard.queries";
import { WidgetHeader } from "./WidgetHeader";
import { StatusDot } from "@/shared/components/data-display/StatusDot";
import { RelativeTime } from "@/shared/components/data-display/RelativeTime";

export async function MyCommitmentsWidget() {
  const commitments = await getMyCommitments();

  // Custom sort: PENDING before MISSED, then by dueDate asc
  const sorted = [...commitments].sort((a, b) => {
    const orderMap: Record<string, number> = { PENDING: 0, MISSED: 1, FULFILLED: 2, DEFERRED: 3 };
    const orderA = orderMap[a.status] ?? 99;
    const orderB = orderMap[b.status] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  return (
    <Card className="col-span-12 md:col-span-6 bg-surface border-border/60">
      <WidgetHeader title="My commitments" actionLabel="View all" actionHref="/commitments" />
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center border-t border-border">
          <CheckCircle2 className="h-5 w-5 text-muted-foreground mb-2" />
          <h3 className="text-xs font-medium text-foreground">No open commitments</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5 max-w-[280px]">
            Commitments extracted from your meetings will show up here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {sorted.map((item) => (
            <li key={item.id}>
              <Link
                href={`/commitments/${item.id}`}
                className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors duration-120"
              >
                <StatusDot status={item.status} />
                <span className="flex-1 truncate text-foreground font-sans text-[13px]">
                  {item.text}
                </span>
                {item.dueDate && (
                  <RelativeTime date={item.dueDate} className="text-2xs shrink-0" />
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
