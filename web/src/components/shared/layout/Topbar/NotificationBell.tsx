"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetDescription,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

export function NotificationBell() {
  const [unreadCount] = useState(0); // Hardcoded 0 for Day 26, to be wired Day 39

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          className="relative flex h-8 w-8 items-center justify-center rounded-radius border border-border bg-surface text-muted-foreground hover:bg-surface-hover hover:text-foreground cursor-pointer transition-colors duration-120 outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="View notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-error" />
          )}
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[380px] sm:w-[440px] border-l border-border bg-background p-6">
        <SheetHeader className="pb-4">
          <SheetTitle className="font-heading text-base-heading font-semibold text-foreground">
            Notifications
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Stay updated with action items, meeting alerts, and commitments.
          </SheetDescription>
        </SheetHeader>
        <Separator className="bg-border" />
        <div className="flex h-[calc(100vh-140px)] flex-col items-center justify-center text-center">
          <div className="rounded-full bg-surface p-4 text-muted-foreground mb-3">
            <Bell className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-medium text-foreground">No notifications yet</h3>
          <p className="mt-1 max-w-[240px] text-xs text-muted-foreground">
            We will alert you here when new commitments are captured or tasks need your attention.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
