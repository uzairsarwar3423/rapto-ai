"use client";

import { useMemo, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { MeetingFilters, PlatformType, MeetingStatus } from "../types";

export function useMeetingFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters: MeetingFilters = useMemo(() => {
    const statusParam = searchParams.get("status");
    const platformParam = searchParams.get("platform");
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const searchParam = searchParams.get("search");

    return {
      status: statusParam ? (statusParam.split(",") as MeetingStatus[]) : undefined,
      platform: platformParam ? (platformParam as PlatformType) : undefined,
      from: fromParam ?? undefined,
      to: toParam ?? undefined,
      search: searchParam ?? undefined,
    };
  }, [searchParams]);

  const setFilters = useCallback(
    (patch: Partial<MeetingFilters>) => {
      const next = new URLSearchParams(searchParams.toString());

      // If setting a new search term or changing filters, reset the cursor
      next.delete("cursor");

      Object.entries(patch).forEach(([key, value]) => {
        if (value === undefined || (Array.isArray(value) && value.length === 0)) {
          next.delete(key);
        } else {
          next.set(key, Array.isArray(value) ? value.join(",") : String(value));
        }
      });

      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  const clearAll = useCallback(() => {
    router.push(pathname, { scroll: false });
  }, [router, pathname]);

  return { filters, setFilters, clearAll };
}
