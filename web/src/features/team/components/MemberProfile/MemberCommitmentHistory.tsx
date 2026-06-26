"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useMemberCommitments } from "../../hooks/useMemberCommitments";
import { CommitmentStatusTabs } from "@/features/commitments/components/CommitmentStatusTabs";
import { CommitmentList } from "@/features/commitments/components/CommitmentList/CommitmentList";
import type { CommitmentStatusFilter } from "@/features/commitments/hooks/useCommitmentFilters";
import type { TeamMember } from "../../types/team.types";
import type { CommitmentAction } from "@/features/commitments/components/commitment-actions.permissions";
import type { Commitment } from "@/features/commitments/types";
import { MarkFulfilledSheet } from "@/features/commitments/components/MarkFulfilledSheet";
import { DeferSheet } from "@/features/commitments/components/DeferSheet";
import { CancelCommitmentSheet } from "@/features/commitments/components/CancelCommitmentSheet";

interface MemberCommitmentHistoryProps {
  member: TeamMember;
}

export function MemberCommitmentHistory({ member }: MemberCommitmentHistoryProps) {
  const router = useRouter();
  const [status, setStatus] = useState<CommitmentStatusFilter>("ALL");

  // Sheets state
  const [activeCommitment, setActiveCommitment] = useState<Commitment | null>(null);
  const [isFulfillOpen, setIsFulfillOpen] = useState(false);
  const [isDeferOpen, setIsDeferOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useMemberCommitments(member.id, status);

  const commitments = data?.pages.flatMap((page) => page.commitments) ?? [];

  const handleAction = (action: CommitmentAction, commitment: Commitment) => {
    setActiveCommitment(commitment);
    if (action === "MARK_FULFILLED") {
      setIsFulfillOpen(true);
    } else if (action === "DEFER") {
      setIsDeferOpen(true);
    } else if (action === "CANCEL") {
      setIsCancelOpen(true);
    } else if (action === "VIEW_HISTORY") {
      router.push(`/commitments/${commitment.id}`);
    }
  };

  const counts = {
    PENDING: member.pending,
    FULFILLED: member.fulfilled,
    MISSED: member.missed,
  };

  return (
    <section id="history" className="scroll-mt-20 flex flex-col gap-4">
      <div>
        <h2 className="font-plus-jakarta font-semibold text-[14px]">History</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Commitments owned by this member
        </p>
      </div>

      <CommitmentStatusTabs
        value={status}
        onValueChange={setStatus}
        counts={counts}
      />

      <CommitmentList
        commitments={commitments}
        isLoading={isLoading}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={!!hasNextPage}
        onLoadMore={fetchNextPage}
        hasActiveFilters={status !== "ALL"}
        onClearFilters={() => setStatus("ALL")}
        onAction={handleAction}
      />

      <MarkFulfilledSheet
        open={isFulfillOpen}
        onOpenChange={setIsFulfillOpen}
        commitment={activeCommitment}
      />
      <DeferSheet
        open={isDeferOpen}
        onOpenChange={setIsDeferOpen}
        commitment={activeCommitment}
      />
      <CancelCommitmentSheet
        open={isCancelOpen}
        onOpenChange={setIsCancelOpen}
        commitment={activeCommitment}
      />
    </section>
  );
}
