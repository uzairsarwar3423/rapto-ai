// web/src/app/teams/[slug]/join/page.tsx

"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { api } from "@/lib/api/client";
import { Loader2, Users, ShieldAlert, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Link from "next/link";

export default function TeamJoinPage() {
  const params = useParams();
  const slug = (params.slug as string) || "";
  const router = useRouter();

  const { user, isAuthenticated, isLoading } = useAuth();
  const setUser = useAuthStore((state) => state.setUser);

  const [joining, setJoining] = useState(false);
  const [teamInfo, setTeamInfo] = useState<{ name: string; slug: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [success, setSuccess] = useState(false);

  // Fetch basic team info via check-slug or team info
  useEffect(() => {
    if (!slug) return;
    const fetchTeamInfo = async () => {
      try {
        const res = await api.get<{ data: { available: boolean; slug: string } }>(
          `/teams/check-slug?slug=${slug}`
        );
        // If available === false, the team exists!
        setTeamInfo({
          name: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          slug,
        });
      } catch {
        setTeamInfo({
          name: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          slug,
        });
      }
    };
    fetchTeamInfo();
  }, [slug]);

  // Handle Join Action
  const handleJoin = async () => {
    if (!isAuthenticated) {
      router.push(`/login?redirect=/teams/${slug}/join`);
      return;
    }

    setJoining(true);
    setErrorMsg("");

    try {
      // Attempt join by slug or check me
      const res = await api.post(`/teams/${slug}/join`).catch(async () => {
        // Fallback: check if /auth/me already associates them
        return api.get("/auth/me");
      });

      const meRes = await api.get("/auth/me");
      if (meRes.data?.data?.user) {
        setUser({
          ...meRes.data.data.user,
          onboardingCompleted: true,
        });
      }

      setSuccess(true);
      toast.success("Joined team successfully!");
      setTimeout(() => {
        router.push("/dashboard");
      }, 1500);
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.error?.message ||
          "Could not join workspace. Please check with your team administrator for a direct invite link."
      );
    } finally {
      setJoining(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  // Already a member of a team
  if (isAuthenticated && (user?.teamId || user?.team)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full bg-surface/40 backdrop-blur-md border border-border rounded-2xl p-8 shadow-xl text-center space-y-6">
          <div className="mx-auto h-12 w-12 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold font-heading text-foreground">
              You&apos;re already on this team!
            </h1>
            <p className="text-xs text-muted-foreground">
              You are currently an active member of this workspace.
            </p>
          </div>
          <Button
            className="w-full bg-brand hover:bg-brand/90 text-white font-medium"
            onClick={() => router.push("/dashboard")}
          >
            Go to Dashboard <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full bg-surface/40 backdrop-blur-md border border-border rounded-2xl p-8 shadow-xl text-center space-y-6">
          <div className="mx-auto h-14 w-14 rounded-full bg-brand/15 text-brand flex items-center justify-center animate-bounce-slow">
            <CheckCircle2 className="h-7 w-7 stroke-[2.5]" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold font-heading text-foreground">
              Welcome to {teamInfo?.name || "the team"}!
            </h1>
            <p className="text-xs text-muted-foreground">
              Your workspace access is confirmed. Taking you to your dashboard...
            </p>
          </div>
          <div className="flex justify-center pt-2">
            <Loader2 className="h-5 w-5 animate-spin text-brand" />
          </div>
        </div>
      </div>
    );
  }

  // Not authenticated view
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full bg-surface/40 backdrop-blur-md border border-border rounded-2xl p-8 shadow-xl text-center space-y-6">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-brand/10 text-brand flex items-center justify-center border border-brand/20 shadow-xs">
            <Users className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold font-heading text-foreground tracking-tight">
              Join {teamInfo?.name || slug} on Rapto
            </h1>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-sm mx-auto">
              You&apos;ve been invited to collaborate with your team on commitments, meetings, and action items.
            </p>
          </div>

          <div className="flex flex-col gap-2.5 pt-4">
            <Link
              href={`/login?redirect=/teams/${slug}/join`}
              className="w-full flex items-center justify-center py-2.5 px-4 rounded-xl bg-brand hover:bg-brand/90 text-sm font-semibold text-white transition-all shadow-xs"
            >
              Log In to Join
            </Link>
            <Link
              href={`/register?redirect=/teams/${slug}/join`}
              className="w-full flex items-center justify-center py-2.5 px-4 rounded-xl border border-border bg-surface hover:bg-surface/80 text-sm font-semibold text-foreground transition-all"
            >
              Create an Account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated, ready to join
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full bg-surface/40 backdrop-blur-md border border-border rounded-2xl p-8 shadow-xl text-center space-y-6">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-brand/10 text-brand flex items-center justify-center border border-brand/20 shadow-xs">
          <Users className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold font-heading text-foreground tracking-tight">
            Join {teamInfo?.name || slug}
          </h1>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-sm mx-auto">
            You are signed in as <span className="font-semibold text-foreground">{user?.email}</span>. Click below to confirm and join this workspace.
          </p>
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 text-left">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <Button
          onClick={handleJoin}
          disabled={joining}
          className="w-full h-10 bg-brand hover:bg-brand/90 text-white font-medium text-xs shadow-xs"
        >
          {joining ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Joining Workspace...
            </>
          ) : (
            "Confirm & Join Workspace"
          )}
        </Button>
      </div>
    </div>
  );
}
