"use client";

import { useMemo, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

// Status filter is intentionally NOT managed via URL to avoid server re-renders
// on tab click. It is kept in local React state in CommitmentTracker.
export type CommitmentStatusFilter = "ALL" | "PENDING" | "FULFILLED" | "MISSED" | "DEFERRED" | "CANCELLED";

export interface CommitmentFiltersState {
  status: CommitmentStatusFilter;
  ownerIds: string[];
  from?: string;
  to?: string;
  confidenceMin?: number;
}

// Only URL-driven filters (no status)
export interface UrlFiltersState {
  ownerIds: string[];
  from?: string;
  to?: string;
  confidenceMin?: number;
}

export function useCommitmentFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Read only the URL-persisted filters (not status)
  const urlFilters: UrlFiltersState = useMemo(() => {
    const ownerIdsParam = searchParams.get("ownerIds");
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const confidenceMinParam = searchParams.get("confidenceMin");

    return {
      ownerIds: ownerIdsParam ? ownerIdsParam.split(",") : [],
      from: fromParam ?? undefined,
      to: toParam ?? undefined,
      confidenceMin: confidenceMinParam ? parseFloat(confidenceMinParam) : undefined,
    };
  }, [searchParams]);

  // Status is read from URL on mount only (for deep link / initial load support)
  // but is NOT written back — tab clicks use local state in CommitmentTracker
  const initialStatus = useMemo(() => {
    return (searchParams.get("status") as CommitmentStatusFilter | null) ?? "ALL";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally only runs on mount

  const setUrlFilters = useCallback(
    (patch: Partial<UrlFiltersState>) => {
      const next = new URLSearchParams(searchParams.toString());

      // Clear pagination cursor on filter change
      next.delete("cursor");
      // Never write status to URL from here
      next.delete("status");

      Object.entries(patch).forEach(([key, value]) => {
        if (value === undefined || (Array.isArray(value) && value.length === 0)) {
          next.delete(key);
        } else {
          next.set(key, Array.isArray(value) ? value.join(",") : String(value));
        }
      });

      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  const clearUrlFilters = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [router, pathname]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (urlFilters.ownerIds.length > 0) count++;
    if (urlFilters.from || urlFilters.to) count++;
    if (urlFilters.confidenceMin !== undefined) count++;
    return count;
  }, [urlFilters]);

  return {
    urlFilters,
    initialStatus,
    setUrlFilters,
    clearUrlFilters,
    activeFilterCount,
  };
}
