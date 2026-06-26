import React from "react";
import { toast } from "sonner";
import Link from "next/link";
import { REALTIME_EVENT_MAP } from "@/shared/lib/websocket/socket.handlers";

export function fireRealtimeToast(
  event: keyof typeof REALTIME_EVENT_MAP,
  payload: { title: string; description?: string; href?: string }
) {
  const entry = REALTIME_EVENT_MAP[event] as any;
  
  // Defensive check to avoid toast spam
  if (!entry || !entry.toast) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`fireRealtimeToast called for "${event}" but registry has no toast policy.`);
    }
    return;
  }

  toast.custom(
    (t) => (
      <div className="flex flex-col gap-0.5 rounded-md border border-border bg-background p-3 shadow-md max-w-xs select-none">
        <p className="font-heading font-semibold text-[13px] text-foreground leading-snug">
          {payload.title}
        </p>
        {payload.description && (
          <p className="font-sans text-[12px] text-muted-foreground leading-normal">
            {payload.description}
          </p>
        )}
        {payload.href && (
          <Link
            href={payload.href}
            onClick={() => toast.dismiss(t)}
            className="text-[12px] font-medium text-primary hover:underline mt-1"
          >
            View →
          </Link>
        )}
      </div>
    ),
    { duration: 6000 }
  );
}
