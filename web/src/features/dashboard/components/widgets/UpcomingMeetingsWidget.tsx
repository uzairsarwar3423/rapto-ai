import React from "react";
import Link from "next/link";
import { Video, Calendar } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getUpcomingMeetings } from "../../api/dashboard.queries";
import { WidgetHeader } from "./WidgetHeader";
import { RelativeTime } from "@/shared/components/data-display/RelativeTime";

function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  if (platform === "GOOGLE_MEET" || platform === "ZOOM" || platform === "MS_TEAMS") {
    return <Video className={className} />;
  }
  return <Calendar className={className} />;
}

function getBadgeVariant(status: string): "default" | "pending" | "fulfilled" | "missed" | "deferred" | "recording" {
  switch (status.toUpperCase()) {
    case "RECORDING":
      return "recording";
    case "BOT_JOINING":
      return "pending";
    case "SCHEDULED":
      return "default";
    default:
      return "default";
  }
}

export async function UpcomingMeetingsWidget() {
  const meetings = await getUpcomingMeetings();

  return (
    <Card className="col-span-12 md:col-span-6 bg-surface border-border/60">
      <WidgetHeader title="Upcoming meetings" actionLabel="View all" actionHref="/meetings" />
      {meetings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center border-t border-border">
          <Video className="h-5 w-5 text-muted-foreground mb-2" />
          <h3 className="text-xs font-medium text-foreground">Nothing scheduled</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5 max-w-[280px]">
            Connect a calendar to auto-detect meetings.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {meetings.map((meeting) => (
            <li key={meeting.id}>
              <Link
                href={`/meetings/${meeting.id}`}
                className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors duration-120"
              >
                <PlatformIcon platform={meeting.platform} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-foreground font-sans text-[13px]">
                  {meeting.title}
                </span>
                <Badge variant={getBadgeVariant(meeting.status)} className="shrink-0 uppercase text-[9px] tracking-wider px-1.5 py-0.5 shadow-none font-bold rounded-sm">
                  {meeting.status}
                </Badge>
                <RelativeTime date={meeting.scheduledAt} className="text-2xs shrink-0 w-16 text-right" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
