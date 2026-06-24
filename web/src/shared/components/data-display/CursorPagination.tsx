"use client";

import React from "react";

interface CursorPaginationProps {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

export function CursorPagination({
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: CursorPaginationProps) {
  if (!hasNextPage) return null;

  return (
    <div className="flex justify-center border-t border-border py-3">
      <button
        onClick={onLoadMore}
        disabled={isFetchingNextPage}
        className="text-xs font-sans text-muted-foreground hover:text-foreground transition-colors duration-120 disabled:opacity-50"
      >
        {isFetchingNextPage ? "Loading..." : "Load more meetings"}
      </button>
    </div>
  );
}
