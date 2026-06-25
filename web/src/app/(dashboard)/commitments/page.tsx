import React from "react";
import { PageContainer } from "@/components/shared/layout/PageContainer";
import { CommitmentTracker } from "@/features/commitments/components/CommitmentTracker/CommitmentTracker";
import { getCommitmentsListServer } from "@/features/commitments/api/commitments.queries.server";

export const dynamic = "force-dynamic";

interface CommitmentsPageProps {
  searchParams: Promise<{
    status?: string;
    ownerIds?: string;
    from?: string;
    to?: string;
    confidenceMin?: string;
    demo?: string;
  }>;
}

export default async function CommitmentsPage({ searchParams }: CommitmentsPageProps) {
  const params = await searchParams;

  // Map searchParams to the structure expected by the server fetcher
  const statusParam = params.status === "ALL" ? undefined : params.status;
  const ownerIdsParam = params.ownerIds ? params.ownerIds.split(",") : [];
  const confidenceMinParam = params.confidenceMin ? parseFloat(params.confidenceMin) : undefined;

  const filters = {
    status: statusParam,
    ownerIds: ownerIdsParam,
    from: params.from,
    to: params.to,
    confidenceMin: confidenceMinParam,
  };

  const initialData = await getCommitmentsListServer(filters);

  return (
    <PageContainer>
      <CommitmentTracker teamId="me" initialData={initialData as any} />
    </PageContainer>
  );
}
