// web/src/shared/hooks/useSortableColumns.ts

import { useState, useMemo } from "react";

export type SortDirection = "asc" | "desc";

export interface SortConfig<T> {
  key: keyof T;
  direction: SortDirection;
}

const ROLE_ORDER: Record<string, number> = {
  OWNER: 0,
  ADMIN: 1,
  MANAGER: 2,
  MEMBER: 3,
};

export function useSortableColumns<T>(
  items: T[],
  defaultSort: SortConfig<T>
) {
  const [sort, setSort] = useState<SortConfig<T>>(defaultSort);

  const sorted = useMemo(() => {
    const copy = [...items];
    copy.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];

      // Handle null/undefined values: push them to the bottom of the list always
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;

      // Special role hierarchy comparison
      if (sort.key === "role") {
        const orderA = ROLE_ORDER[String(av).toUpperCase()] ?? 99;
        const orderB = ROLE_ORDER[String(bv).toUpperCase()] ?? 99;
        const cmp = orderA - orderB;
        return sort.direction === "asc" ? cmp : -cmp;
      }

      let cmp = 0;
      if (typeof av === "string" && typeof bv === "string") {
        cmp = av.localeCompare(bv);
      } else {
        const numA = Number(av);
        const numB = Number(bv);
        
        if (isNaN(numA) && isNaN(numB)) {
          cmp = 0;
        } else if (isNaN(numA)) {
          return 1;
        } else if (isNaN(numB)) {
          return -1;
        } else {
          cmp = numA - numB;
        }
      }

      return sort.direction === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [items, sort]);

  const toggleSort = (key: keyof T) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" } // clicking a new column always resets to ascending
    );
  };

  return { sorted, sort, toggleSort };
}
