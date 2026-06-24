"use client";

import React, { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/shared/layout/PageContainer";

interface MeetingsErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function MeetingsError({ error, reset }: MeetingsErrorProps) {
  useEffect(() => {
    // Log the error to an analytics or error tracking service
    console.error("Meetings page error:", error);
  }, [error]);

  return (
    <PageContainer>
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center font-sans">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/20 text-red-600 border border-red-200 dark:border-red-800/30">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-foreground">
          Something went wrong
        </h2>
        <p className="mt-2 text-xs text-muted-foreground max-w-md">
          An error occurred while trying to load the meetings. Please try again.
        </p>
        {error.message && (
          <pre className="mt-4 p-3 rounded bg-muted text-[10px] font-mono text-left max-w-lg overflow-x-auto border border-border text-muted-foreground">
            {error.message}
          </pre>
        )}
        <div className="mt-6">
          <Button
            type="button"
            onClick={reset}
            className="text-xs bg-brand hover:bg-brand/90 text-white flex items-center gap-1.5 h-9"
          >
            <RefreshCw className="h-3 w-3" />
            Try again
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}
