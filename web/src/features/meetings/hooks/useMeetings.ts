"use client";

import { useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchMeetingsClient } from "../api/meetings.queries";
import type { MeetingFilters, MeetingListItem, PaginatedMeetingsResponse } from "../types";

/**
 * Base64url helper to reconstruct nextCursor for initial RSC data.
 * Mimics the backend's pagination encodeCursor utility.
 */
function encodeCursor(id: string, scheduledAt: string): string {
  const payload = {
    id,
    createdAt: new Date(scheduledAt).toISOString(),
  };
  const jsonStr = JSON.stringify(payload);
  if (typeof btoa !== "undefined") {
    return btoa(jsonStr)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
  return Buffer.from(jsonStr).toString("base64url");
}

export function useMeetings(
  filters: MeetingFilters,
  opts?: { initialData?: MeetingListItem[] }
) {
  // Store the initial filters on mount to ensure initialData is only applied
  // to the query key matching the initial page load parameters.
  const initialFiltersRef = useRef(filters);
  const isInitialQuery = JSON.stringify(filters) === JSON.stringify(initialFiltersRef.current);

  return useInfiniteQuery<PaginatedMeetingsResponse>({
    queryKey: ["meetings", "list", filters],
    queryFn: ({ pageParam }) => fetchMeetingsClient(filters, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialData: isInitialQuery && opts?.initialData && opts.initialData.length > 0
      ? {
          pages: [
            {
              meetings: opts.initialData,
              nextCursor:
                opts.initialData.length >= 30
                  ? encodeCursor(
                      opts.initialData[opts.initialData.length - 1].id,
                      opts.initialData[opts.initialData.length - 1].scheduledAt
                    )
                  : null,
              hasMore: opts.initialData.length >= 30,
            },
          ],
          pageParams: [undefined],
        }
      : undefined,
    staleTime: 30_000,
  });
}
