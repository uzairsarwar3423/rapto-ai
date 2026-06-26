"use client";

import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ActionItemsError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center font-sans">
      <h2 className="text-base font-semibold text-foreground mb-2">Something went wrong!</h2>
      <p className="text-xs text-muted-foreground max-w-sm mb-6">
        An error occurred while loading your action items. Please try again.
      </p>
      <Button onClick={reset} size="sm">
        Try again
      </Button>
    </div>
  );
}
