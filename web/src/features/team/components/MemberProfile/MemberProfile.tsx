"use client";

import React from "react";
import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
import { useMemberProfile } from "../../hooks/useMemberProfile";
import { MemberProfileHeader } from "./MemberProfileHeader";
import { MemberSectionNav } from "./MemberSectionNav";
import { MemberScoreBreakdown } from "./MemberScoreBreakdown";
import { MemberTrendChart } from "./MemberTrendChart";
import { MemberCommitmentHistory } from "./MemberCommitmentHistory";
import { FullPageSpinner } from "@/components/shared/feedback/FullPageSpinner";

interface MemberProfileProps {
  memberId: string;
}

export function MemberProfile({ memberId }: MemberProfileProps) {
  const { data: member, isLoading, error } = useMemberProfile(memberId);

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (error || !member) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-6 select-none font-sans">
        <h2 className="text-lg font-semibold text-foreground font-heading">
          Member not found
        </h2>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
          The teammate profile you are looking for does not exist or you do not have permission to view it.
        </p>
        <Link
          href="/team"
          className="mt-4 text-xs font-semibold text-brand hover:underline flex items-center gap-1"
        >
          Back to team list
        </Link>
      </div>
    );
  }

  const sections = [
    { id: "summary", label: "Summary" },
    { id: "trends", label: "Trends" },
    { id: "history", label: "History" },
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 font-sans">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground select-none">
        <Link
          href="/team"
          className="hover:text-foreground font-semibold flex items-center gap-1 transition-colors duration-150"
        >
          <Users className="size-3.5" />
          Team
        </Link>
        <ChevronRight className="size-3" />
        <span className="text-foreground font-medium truncate">
          {member.name}
        </span>
      </nav>

      {/* Profile Header */}
      <MemberProfileHeader member={member} />

      {/* Sticky Section Navigation */}
      <MemberSectionNav sections={sections} />

      {/* Main Sections Stack */}
      <div className="space-y-10 pt-2">
        <MemberScoreBreakdown member={member} />
        
        <MemberTrendChart memberId={memberId} />

        <MemberCommitmentHistory member={member} />
      </div>
    </div>
  );
}
