"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCommitmentCountsClient } from "../api/commitments.queries";

export function useCommitmentCounts(
  teamId: string,
  opts?: { initialData?: Record<string, number> }
) {
  return useQuery<Record<string, number>>({
    queryKey: ["commitments", "counts", teamId],
    queryFn: () => fetchCommitmentCountsClient(),
    initialData: opts?.initialData,
    staleTime: 30_000,
  });
}
