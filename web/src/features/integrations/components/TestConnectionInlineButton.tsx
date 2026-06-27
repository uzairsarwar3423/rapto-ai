"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, AlertCircle, Loader2 } from "lucide-react";
import { useTestConnection } from "../hooks/useTestConnection";
import { cn } from "@/lib/utils";

interface TestConnectionInlineButtonProps {
  provider: string;
  isCalendar?: boolean;
}

export function TestConnectionInlineButton({
  provider,
  isCalendar = false,
}: TestConnectionInlineButtonProps) {
  const { mutate: test, isPending, isSuccess, isError, data } = useTestConnection();
  const [state, setState] = useState<"idle" | "testing" | "success" | "error">("idle");

  useEffect(() => {
    if (isPending) {
      setState("testing");
    }
  }, [isPending]);

  useEffect(() => {
    if (isSuccess && data) {
      if (data.healthy) {
        setState("success");
      } else {
        setState("error");
      }
      const t = setTimeout(() => setState("idle"), 2500);
      return () => clearTimeout(t);
    }
  }, [isSuccess, data]);

  useEffect(() => {
    if (isError) {
      setState("error");
      const t = setTimeout(() => setState("idle"), 2500);
      return () => clearTimeout(t);
    }
  }, [isError]);

  const handleTest = (e: React.MouseEvent) => {
    e.stopPropagation();
    test({ provider, isCalendar });
  };

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={state === "testing"}
      onClick={handleTest}
      className={cn(
        "h-7 text-[11px] font-sans font-medium px-2.5 rounded-md transition-all duration-150 border-muted/30 hover:bg-muted/10",
        state === "success" &&
          "border-emerald-500/30 text-emerald-600 bg-emerald-500/5 hover:bg-emerald-500/10",
        state === "error" &&
          "border-destructive/30 text-destructive bg-destructive/5 hover:bg-destructive/10"
      )}
    >
      {state === "testing" && <Loader2 className="w-3 h-3 mr-1 animate-spin text-muted-foreground/60" />}
      {state === "success" && <Check className="w-3 h-3 mr-1 text-emerald-600 stroke-[3]" />}
      {state === "error" && <AlertCircle className="w-3 h-3 mr-1 text-destructive" />}

      {state === "idle" && "Test Connection"}
      {state === "testing" && "Testing..."}
      {state === "success" && "Healthy"}
      {state === "error" && "Connection Failed"}
    </Button>
  );
}
