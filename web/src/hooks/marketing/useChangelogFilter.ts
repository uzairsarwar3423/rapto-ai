"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useTransition, useState, useEffect } from "react";
import {
  changelogEntries,
  ChangelogEntry,
  ChangelogCategory,
} from "@/lib/marketing/content/changelog.content";

export function useChangelogFilter() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  // URL State values
  const categoryParam = searchParams.get("category");
  const queryParam = searchParams.get("q");

  const activeCategory = categoryParam || "All";
  const [searchQuery, setSearchQuery] = useState(queryParam || "");

  // Debounced sync to URL params for the search query
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (searchQuery.trim()) {
        params.set("q", searchQuery);
      } else {
        params.delete("q");
      }
      
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      });
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, pathname, router]);

  // Sync state if URL search query changes externally
  useEffect(() => {
    setSearchQuery(queryParam || "");
  }, [queryParam]);

  // Filter entries
  const filteredEntries = changelogEntries.filter((entry) => {
    // 1. Category filter
    const matchesCategory =
      activeCategory === "All" || entry.category === activeCategory;

    // 2. Search query filter
    const query = (queryParam || "").toLowerCase().trim();
    const matchesSearch =
      !query ||
      entry.title.toLowerCase().includes(query) ||
      entry.body.toLowerCase().includes(query);

    return matchesCategory && matchesSearch;
  });

  const setCategory = (category: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (category === "All") {
      params.delete("category");
    } else {
      params.set("category", category);
    }
    
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  return {
    activeCategory,
    setCategory,
    searchQuery,
    setSearchQuery,
    filteredEntries,
    isPending,
  };
}
