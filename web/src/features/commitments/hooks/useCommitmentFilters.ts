"use client";

import { useMemo, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { CommitmentStatus } from "../types";

export type CommitmentStatusFilter = "ALL" | CommitmentStatus;

export interface CommitmentFiltersState {
  status: CommitmentStatusFilter;
  ownerIds: string[];
  from?: string;
  to?: string;
  confidenceMin?: number;
}

export function useCommitmentFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters: CommitmentFiltersState = useMemo(() => {
    const statusParam = searchParams.get("status") as CommitmentStatusFilter | null;
    const ownerIdsParam = searchParams.get("ownerIds");
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const confidenceMinParam = searchParams.get("confidenceMin");

    return {
      status: statusParam || "ALL",
      ownerIds: ownerIdsParam ? ownerIdsParam.split(",") : [],
      from: fromParam ?? undefined,
      to: toParam ?? undefined,
      confidenceMin: confidenceMinParam ? parseFloat(confidenceMinParam) : undefined,
    };
  }, [searchParams]);

  const setFilters = useCallback(
    (patch: Partial<CommitmentFiltersState>) => {
      const next = new URLSearchParams(searchParams.toString());

      // If updating filters, clear pagination cursor to return to the first page
      next.delete("cursor");

      Object.entries(patch).forEach(([key, value]) => {
        if (value === undefined || (Array.isArray(value) && value.length === 0)) {
          next.delete(key);
        } else if (key === "status" && value === "ALL") {
          next.delete("status");
        } else {
          next.set(key, Array.isArray(value) ? value.join(",") : String(value));
        }
      });

      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  const clearFilter = useCallback(
    (key: keyof CommitmentFiltersState) => {
      setFilters({ [key]: undefined });
    },
    [setFilters]
  );

  const clearAll = useCallback(() => {
    router.push(pathname, { scroll: false });
  }, [router, pathname]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.ownerIds.length > 0) count++;
    if (filters.from || filters.to) count++;
    if (filters.confidenceMin !== undefined) count++;
    return count;
  }, [filters]);

  return {
    filters,
    setFilters,
    clearFilter,
    clearAll,
    activeFilterCount,
  };
}
