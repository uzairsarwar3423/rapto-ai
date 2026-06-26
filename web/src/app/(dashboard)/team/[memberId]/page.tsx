import React from "react";
import type { Metadata } from "next";
import { MemberProfile } from "@/features/team/components/MemberProfile/MemberProfile";

export interface MemberDetailPageProps {
  params: Promise<{
    memberId: string;
  }>;
}

export const metadata: Metadata = {
  title: "Member Profile | Vocaply",
  description: "View teammate performance, trend lines, and commitment history.",
};

export default async function MemberDetailPage({ params }: MemberDetailPageProps) {
  const { memberId } = await params;

  return <MemberProfile memberId={memberId} />;
}
