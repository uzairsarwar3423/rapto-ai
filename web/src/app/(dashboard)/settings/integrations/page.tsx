"use client";

import React, { Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { IntegrationsGrid } from "@/features/integrations/components/IntegrationsGrid";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

function IntegrationsGridWrapper() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");

    if (connected) {
      const providerName = connected.charAt(0) + connected.slice(1).toLowerCase().replace("_calendar", " Calendar");
      toast.success(`${providerName} connected successfully!`);
      
      // Clean query parameters from URL
      const params = new URLSearchParams(window.location.search);
      params.delete("connected");
      const newQuery = params.toString();
      router.replace(`${window.location.pathname}${newQuery ? `?${newQuery}` : ""}`);
    }

    if (error) {
      toast.error(`Connection failed: ${error.replace(/_/g, " ")}`);
      
      // Clean query parameters from URL
      const params = new URLSearchParams(window.location.search);
      params.delete("error");
      const newQuery = params.toString();
      router.replace(`${window.location.pathname}${newQuery ? `?${newQuery}` : ""}`);
    }
  }, [searchParams, router]);

  return <IntegrationsGrid />;
}

export default function IntegrationsSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="space-y-8 mt-10">
            <div className="space-y-4">
              <Skeleton className="h-4 w-40" />
              <div className="divide-y divide-muted/10 border border-muted/20 rounded-lg bg-card overflow-hidden">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3 w-1/3">
                      <Skeleton className="w-6 h-6 rounded-md" />
                      <div className="space-y-1.5 flex-1">
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-3 w-3/4" />
                      </div>
                    </div>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      }
    >
      <IntegrationsGridWrapper />
    </Suspense>
  );
}
