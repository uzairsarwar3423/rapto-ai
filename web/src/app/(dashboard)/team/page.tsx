// web/src/app/(dashboard)/team/page.tsx

import React from "react";
import { TeamHealthDashboard } from "@/features/team/components/TeamHealthDashboard/TeamHealthDashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Team Health Dashboard | Rapto",
  description:
    "Review teammate performance metrics, track fulfillment rates, and configure collaborators inside your team workspace.",
};

export default function TeamPage() {
  return <TeamHealthDashboard />;
}
