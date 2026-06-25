"use client";

import { useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchCommitmentsListClient } from "../api/commitments.queries";
import type { Commitment } from "../types";
import type { CommitmentFiltersState } from "./useCommitmentFilters";

interface PaginatedCommitmentsResponse {
  commitments: Commitment[];
  nextCursor: string | null;
  counts: Record<string, number>;
}

export function useCommitments(
  filters: CommitmentFiltersState,
  opts?: { initialData?: Commitment[]; nextCursor?: string | null; counts?: Record<string, number> }
) {
  // Store the initial filters on mount to ensure initialData is only applied
  // to the query key matching the initial page load parameters.
  const initialFiltersRef = useRef(filters);
  const isInitialQuery = JSON.stringify(filters) === JSON.stringify(initialFiltersRef.current);

  const apiFilters = {
    ...filters,
    status: filters.status === "ALL" ? undefined : [filters.status],
  };

  return useInfiniteQuery<PaginatedCommitmentsResponse>({
    queryKey: ["commitments", "list", "team", apiFilters],
    queryFn: ({ pageParam }) =>
      fetchCommitmentsListClient(apiFilters, pageParam as string | undefined, 20),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialData:
      isInitialQuery && opts?.initialData && opts.initialData.length > 0
        ? {
            pages: [
              {
                commitments: opts.initialData,
                nextCursor: opts.nextCursor ?? null,
                counts: opts.counts || {},
              },
            ],
            pageParams: [undefined],
          }
        : undefined,
    staleTime: 30_000,
  });
}
