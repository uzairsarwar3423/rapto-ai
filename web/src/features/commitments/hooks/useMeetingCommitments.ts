import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { fetchCommitmentsClient } from "../api/commitments.queries";
import type { Commitment } from "../types";

export function useMeetingCommitments(meetingId: string, initialData?: Commitment[]) {
  return useQuery<Commitment[]>({
    queryKey: queryKeys.commitments.byMeeting(meetingId),
    queryFn: () => fetchCommitmentsClient(meetingId),
    initialData: initialData && initialData.length > 0 ? initialData : undefined,
    staleTime: 30 * 1000,
  });
}
