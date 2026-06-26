import React from "react";
import { ActionItemDetailClientPage } from "@/features/action-items/components/ActionItemDetailClientPage";

export interface ActionItemDetailPageProps {
  params: Promise<{
    actionItemId: string;
  }>;
}

export default async function ActionItemDetailPage({ params }: ActionItemDetailPageProps) {
  const { actionItemId } = await params;
  return <ActionItemDetailClientPage actionItemId={actionItemId} />;
}
