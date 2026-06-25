import { useQueryClient, QueryKey } from "@tanstack/react-query";
import type { Commitment, CommitmentStatus } from "../types";

export interface CommitmentSnapshot {
  queries: Array<[QueryKey, any]>;
}

function queryContainsCommitment(key: QueryKey, data: any, id: string): boolean {
  if (!data) return false;

  // Case 1: Single commitment detail
  if (data && typeof data === "object" && (data as any).id === id) {
    return true;
  }

  // Case 2: Flat list/array (e.g., meeting-scoped commitments)
  if (Array.isArray(data)) {
    return data.some((item: any) => item && item.id === id);
  }

  // Case 3: Infinite query structure (e.g., tracker list commitments)
  if (data && typeof data === "object" && Array.isArray((data as any).pages)) {
    return (data as any).pages.some((page: any) => {
      if (page && Array.isArray(page.commitments)) {
        return page.commitments.some((c: any) => c && c.id === id);
      }
      return false;
    });
  }

  return false;
}

function deepPatchCommitmentInStructure(
  oldData: any,
  id: string,
  patch: Partial<Commitment>
): any {
  if (!oldData) return oldData;

  // Case 1: Single commitment detail
  if (oldData && typeof oldData === "object" && (oldData as any).id === id) {
    return { ...oldData, ...patch };
  }

  // Case 2: Flat list/array
  if (Array.isArray(oldData)) {
    return oldData.map((item: any) => {
      if (item && item.id === id) {
        return { ...item, ...patch };
      }
      return item;
    });
  }

  // Case 3: Infinite query structure
  if (oldData && typeof oldData === "object" && Array.isArray((oldData as any).pages)) {
    return {
      ...oldData,
      pages: (oldData as any).pages.map((page: any) => {
        if (page && Array.isArray(page.commitments)) {
          return {
            ...page,
            commitments: page.commitments.map((c: any) => {
              if (c && c.id === id) {
                return { ...c, ...patch };
              }
              return c;
            }),
          };
        }
        return page;
      }),
    };
  }

  return oldData;
}

export function useCommitmentMutationCache() {
  const queryClient = useQueryClient();

  const patchCommitment = async (
    id: string,
    patch: Partial<Commitment>
  ): Promise<CommitmentSnapshot> => {
    // 1. Cancel in-flight queries containing commitments or meetings
    await queryClient.cancelQueries({
      predicate: (query) => {
        const key = query.queryKey;
        return (
          Array.isArray(key) &&
          (key.includes("commitments") || key.includes("meetings"))
        );
      },
    });

    const snapshot: CommitmentSnapshot = { queries: [] };
    const queries = queryClient.getQueryCache().getAll();

    // 2. Identify the commitment's old status from the current cache
    let oldStatus: CommitmentStatus | undefined;
    for (const query of queries) {
      const data = query.state.data as any;
      if (!data) continue;

      if (data && typeof data === "object" && (data as any).id === id) {
        oldStatus = (data as any).status;
        break;
      }
      if (Array.isArray(data)) {
        const found = data.find((item: any) => item && item.id === id);
        if (found) {
          oldStatus = found.status;
          break;
        }
      }
      if (data && typeof data === "object" && Array.isArray((data as any).pages)) {
        for (const page of (data as any).pages) {
          if (page && Array.isArray(page.commitments)) {
            const found = page.commitments.find((c: any) => c && c.id === id);
            if (found) {
              oldStatus = found.status;
              break;
            }
          }
        }
        if (oldStatus) break;
      }
    }

    // 3. Patch all commitment-related queries
    for (const query of queries) {
      const key = query.queryKey;
      const data = query.state.data;

      if (queryContainsCommitment(key, data, id)) {
        snapshot.queries.push([key, data]);
        queryClient.setQueryData(key, (oldVal: any) =>
          deepPatchCommitmentInStructure(oldVal, id, patch)
        );
      }
    }

    // 4. Optimistically patch counts if the status has changed
    if (oldStatus && patch.status && oldStatus !== patch.status) {
      for (const query of queries) {
        const key = query.queryKey;
        if (
          Array.isArray(key) &&
          key[0] === "commitments" &&
          key[1] === "counts"
        ) {
          snapshot.queries.push([key, query.state.data]);
          queryClient.setQueryData(key, (oldCounts: any) => {
            if (!oldCounts) return oldCounts;
            const newCounts = { ...oldCounts };

            // Decrement the old status count
            if (typeof newCounts[oldStatus!] === "number") {
              newCounts[oldStatus!] = Math.max(0, newCounts[oldStatus!] - 1);
            }

            // Increment the new status count
            const newStatus = patch.status!;
            if (typeof newCounts[newStatus] === "number") {
              newCounts[newStatus] = newCounts[newStatus] + 1;
            } else {
              newCounts[newStatus] = 1;
            }

            return newCounts;
          });
        }
      }
    }

    return snapshot;
  };

  const restoreCommitment = (snapshot: CommitmentSnapshot) => {
    for (const [key, oldData] of snapshot.queries) {
      queryClient.setQueryData(key, oldData);
    }
  };

  return {
    patchCommitment,
    restoreCommitment,
  };
}
