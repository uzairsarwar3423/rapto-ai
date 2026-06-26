"use client";

import React from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { fetchActionItemDetailClient } from "../api/action-items.queries";
import { updateActionItemClient, ActionItemPatch } from "../api/action-items.mutations";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { useTeamMembers } from "@/features/commitments/hooks/useTeamMembers";
import { PageContainer } from "@/components/shared/layout/PageContainer";
import { ActionItemDetailHeader } from "./ActionItemDetailHeader";
import { ActionItemCompletedCheckbox } from "./ActionItemCompletedCheckbox";
import { SyncToJiraButton } from "./SyncToJiraButton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, Calendar, User, AlertCircle, Link2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import type { PriorityLevel } from "../types";

interface ActionItemDetailClientPageProps {
  actionItemId: string;
}

export function ActionItemDetailClientPage({ actionItemId }: ActionItemDetailClientPageProps) {
  const queryClient = useQueryClient();
  const teamId = useAuthStore((state) => state.user?.teamId) || "";
  const { data: teamMembers = [] } = useTeamMembers();

  const { data: item, isLoading, error } = useQuery({
    queryKey: queryKeys.actionItems.detail(teamId, actionItemId),
    queryFn: () => fetchActionItemDetailClient(actionItemId),
    enabled: !!actionItemId && !!teamId,
  });

  const updateMutation = useMutation({
    mutationFn: (patch: ActionItemPatch) => updateActionItemClient(actionItemId, patch),
    onSuccess: (updated) => {
      // Atomic cache update
      queryClient.setQueryData(queryKeys.actionItems.detail(teamId, actionItemId), updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.actionItems.all(teamId) });
      toast.success("Action item updated");
    },
    onError: () => {
      toast.error("Failed to update action item");
    },
  });

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex flex-col gap-6 animate-pulse font-sans">
          <div className="h-4 w-20 bg-muted-foreground/10 rounded" />
          <div className="flex flex-col md:flex-row gap-6 w-full mt-4">
            <div className="flex-1 flex flex-col gap-4">
              <div className="h-8 w-3/4 bg-muted-foreground/10 rounded" />
              <div className="h-4 w-full bg-muted-foreground/10 rounded" />
              <div className="h-4 w-5/6 bg-muted-foreground/10 rounded" />
            </div>
            <div className="w-full md:w-64 flex flex-col gap-4 bg-muted/20 p-4 border border-border/40 rounded-lg">
              <div className="h-5 w-20 bg-muted-foreground/10 rounded" />
              <div className="h-8 w-full bg-muted-foreground/10 rounded" />
            </div>
          </div>
        </div>
      </PageContainer>
    );
  }

  if (error || !item) {
    return (
      <PageContainer>
        <div className="flex flex-col items-center justify-center min-h-[300px] text-center font-sans">
          <h2 className="text-base font-semibold text-foreground mb-2">Failed to load action item</h2>
          <p className="text-xs text-muted-foreground mb-6">
            The action item you are trying to view does not exist or you do not have permission to view it.
          </p>
          <Button asChild size="sm">
            <Link href="/action-items">Back to list</Link>
          </Button>
        </div>
      </PageContainer>
    );
  }

  const handleTitleSave = async (newText: string) => {
    await updateMutation.mutateAsync({ text: newText });
  };

  return (
    <PageContainer>
      <div className="flex flex-col gap-4 font-sans max-w-5xl">
        {/* Back Link */}
        <Link
          href="/action-items"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit focus:outline-none"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span>Back to Action Items</span>
        </Link>

        {/* Dynamic Detail Grid */}
        <div className="flex flex-col md:flex-row gap-8 w-full items-start mt-2">
          {/* Main Context (Left) */}
          <div className="flex-1 min-w-0 flex flex-col gap-6">
            {/* Title Block */}
            <div className="flex items-start gap-3">
              <ActionItemCompletedCheckbox
                checked={item.completed}
                onCheckedChange={(checked) => updateMutation.mutate({ completed: checked })}
                ariaLabel="Toggle completed"
                className="h-5 w-5 mt-1 shrink-0 transition-transform duration-120 hover:scale-105"
              />
              <div className="flex-1 min-w-0">
                <ActionItemDetailHeader initialText={item.text} onSave={handleTitleSave} />
              </div>
            </div>

            {/* Context/Description Card */}
            <div className="border border-border/40 bg-card rounded-lg p-5">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                Context & Transcription
              </h3>
              <p className="text-sm text-foreground leading-relaxed font-light mb-4">
                {item.text}
              </p>
              {item.meeting && (
                <div className="flex flex-col gap-2 pt-4 border-t border-border/40">
                  <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Source Meeting
                  </span>
                  <div className="flex items-center gap-2">
                    <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <Link
                      href={`/meetings/${item.meeting.id}`}
                      className="text-xs text-brand hover:underline font-medium"
                    >
                      {item.meeting.title}
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Properties Panel (Right Sidebar) */}
          <div className="w-full md:w-72 bg-muted/10 border border-border/30 rounded-lg p-4 flex flex-col gap-5">
            <h3 className="text-2xs font-bold text-muted-foreground uppercase tracking-wider">
              Properties
            </h3>

            {/* Status */}
            <div className="flex flex-col gap-1.5">
              <span className="text-2xs font-semibold text-muted-foreground uppercase">Status</span>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border/30 bg-card w-full">
                <CheckCircle
                  className={`h-4.5 w-4.5 shrink-0 ${
                    item.completed ? "text-emerald-500 fill-emerald-500/10" : "text-muted-foreground/40"
                  }`}
                />
                <span className="text-xs font-medium text-foreground">
                  {item.completed ? "Completed" : "In Progress"}
                </span>
              </div>
            </div>

            {/* Assignee */}
            <div className="flex flex-col gap-1.5">
              <span className="text-2xs font-semibold text-muted-foreground uppercase">Assignee</span>
              <Select
                value={item.assigneeId || "UNASSIGNED"}
                onValueChange={(val) =>
                  updateMutation.mutate({ assigneeId: val === "UNASSIGNED" ? null : val })
                }
              >
                <SelectTrigger className="h-9 text-xs border border-border bg-card w-full">
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <SelectValue placeholder="Assignee" />
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-background border border-border shadow-lg">
                  <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
                  {teamMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Priority */}
            <div className="flex flex-col gap-1.5">
              <span className="text-2xs font-semibold text-muted-foreground uppercase">Priority</span>
              <Select
                value={item.priority || "MEDIUM"}
                onValueChange={(val) => updateMutation.mutate({ priority: val as PriorityLevel })}
              >
                <SelectTrigger className="h-9 text-xs border border-border bg-card w-full">
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <SelectValue placeholder="Priority" />
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-background border border-border shadow-lg">
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Due Date */}
            <div className="flex flex-col gap-1.5">
              <span className="text-2xs font-semibold text-muted-foreground uppercase">Due Date</span>
              <div className="relative">
                <Calendar className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  type="date"
                  value={item.dueDate ? item.dueDate.split("T")[0] : ""}
                  onChange={(e) => {
                    const val = e.target.value ? new Date(e.target.value).toISOString() : null;
                    updateMutation.mutate({ dueDate: val });
                  }}
                  className="pl-8.5 h-9 text-xs border border-border bg-card w-full focus-visible:ring-0 focus-visible:border-brand"
                />
              </div>
            </div>

            {/* Integration Sync */}
            <div className="flex flex-col gap-1.5 border-t border-border/40 pt-4">
              <span className="text-2xs font-semibold text-muted-foreground uppercase">
                Ticketing Integrations
              </span>
              <div className="flex items-center justify-between bg-card border border-border/30 rounded-md p-2.5">
                <span className="text-xs text-muted-foreground font-sans">Jira sync</span>
                <SyncToJiraButton actionItem={item} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
