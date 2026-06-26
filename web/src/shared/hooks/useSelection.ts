"use client";

import { useState, useCallback, useMemo } from "react";

export interface UseSelectionReturn<T extends string> {
  selectedIds: Set<T>;
  isSelected: (id: T) => boolean;
  toggle: (id: T) => void;
  toggleRange: (ids: T[]) => void;
  toggleAll: (allIds: T[]) => void;
  clear: () => void;
  selectionState: "none" | "some" | "all";
}

export function useSelection<T extends string>(totalVisibleIds: T[]): UseSelectionReturn<T> {
  const [selectedIds, setSelectedIds] = useState<Set<T>>(new Set());

  const isSelected = useCallback((id: T) => selectedIds.has(id), [selectedIds]);

  const toggle = useCallback((id: T) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleRange = useCallback((ids: T[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const someUnselected = ids.some((id) => !prev.has(id));
      if (someUnselected) {
        // If there is any item in the range not selected, select the whole range
        ids.forEach((id) => next.add(id));
      } else {
        // If all items in the range are selected, deselect the whole range
        ids.forEach((id) => next.delete(id));
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback((allIds: T[]) => {
    setSelectedIds((prev) => {
      const allSelected = allIds.every((id) => prev.has(id));
      if (allSelected) {
        // Deselect all visible
        const next = new Set(prev);
        allIds.forEach((id) => next.delete(id));
        return next;
      } else {
        // Select all visible
        const next = new Set(prev);
        allIds.forEach((id) => next.add(id));
        return next;
      }
    });
  }, []);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectionState = useMemo((): "none" | "some" | "all" => {
    if (selectedIds.size === 0) return "none";
    const allSelected = totalVisibleIds.length > 0 && totalVisibleIds.every((id) => selectedIds.has(id));
    if (allSelected) return "all";
    return "some";
  }, [selectedIds, totalVisibleIds]);

  return {
    selectedIds,
    isSelected,
    toggle,
    toggleRange,
    toggleAll,
    clear,
    selectionState,
  };
}
