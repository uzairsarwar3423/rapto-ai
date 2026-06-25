import { notFound } from "next/navigation";
import { getCommitmentDetailServer, getCommitmentStatsServer } from "@/features/commitments/api/commitments.queries.server";
import { CommitmentDetailClientPage } from "@/features/commitments/components/CommitmentDetailClientPage";

export interface CommitmentDetailPageProps {
  params: Promise<{
    commitmentId: string;
  }>;
  searchParams: Promise<{
    [key: string]: string | string[] | undefined;
  }>;
}

export default async function CommitmentDetailPage({
  params,
  searchParams,
}: CommitmentDetailPageProps) {
  // Await params and searchParams per Next.js 15/16 guidelines
  const { commitmentId } = await params;
  const [commitment, stats] = await Promise.all([
    getCommitmentDetailServer(commitmentId),
    getCommitmentStatsServer(),
  ]);

  // Standard secure 404 response on mismatch/missing resource
  if (!commitment) {
    notFound();
  }

  return (
    <CommitmentDetailClientPage
      commitmentId={commitmentId}
      initialCommitment={commitment as any}
      initialStats={stats}
    />
  );
}
