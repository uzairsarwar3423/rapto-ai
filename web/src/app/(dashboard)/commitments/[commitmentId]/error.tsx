"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export interface CommitmentDetailErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function CommitmentDetailError({
  error,
  reset,
}: CommitmentDetailErrorProps) {
  useEffect(() => {
    console.error("Commitment detail routing error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[360px] text-center font-sans px-4 space-y-4">
      <h2 className="text-base font-semibold text-foreground">
        Unable to load commitment details
      </h2>
      <p className="text-xs text-muted-foreground max-w-sm leading-normal">
        The commitment might not exist, could belong to another team context, or you might lack permissions.
      </p>
      
      <div className="flex items-center gap-3 pt-2">
        <Button
          onClick={() => reset()}
          variant="outline"
          className="h-8 text-xs px-3 rounded-sm border border-border bg-transparent text-foreground hover:bg-accent/40"
        >
          Try Again
        </Button>
        <Link
          href="/commitments"
          className="h-8 text-xs px-3 rounded-sm bg-foreground text-background hover:bg-foreground/90 flex items-center justify-center font-medium transition-colors"
        >
          Back to List
        </Link>
      </div>
    </div>
  );
}
