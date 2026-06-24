"use client";

import React from "react";
import { Plus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function QuickActionsRow() {
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => toast.info("Coming Day 32")}
      >
        <Plus className="h-3.5 w-3.5" /> Add meeting
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => toast.info("Coming soon")}
      >
        <UserPlus className="h-3.5 w-3.5" /> Invite teammate
      </Button>
    </div>
  );
}
