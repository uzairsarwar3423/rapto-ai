"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { api } from "@/lib/api/client";
import { Loader2, ShieldAlert, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export default function InviteAcceptPage() {
  const params = useParams();
  const token = params.token as string;
  const router = useRouter();
  
  const { user, isAuthenticated, isLoading } = useAuth();
  const setUser = useAuthStore(state => state.setUser);
  
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    // If auth state is still loading, wait
    if (isLoading) return;

    // If user is not authenticated, we can't accept the invite yet.
    // They must log in or sign up first.
    if (!isAuthenticated) {
      return;
    }

    // Attempt to accept invite automatically
    const acceptInvite = async () => {
      if (status !== "idle") return;
      
      setStatus("loading");
      try {
        const res = await api.post(`/teams/invite/${token}`);
        
        // Update user state if the backend returned the updated user object or we can just fetch /me
        const meRes = await api.get("/auth/me");
        if (meRes.data?.data?.user) {
          setUser({
            ...meRes.data.data.user,
            onboardingCompleted: true // Force to true just in case backend is stale
          });
        }
        
        setStatus("success");
        toast.success("Invitation accepted successfully!");
        
        // Redirect to dashboard after a brief delay
        setTimeout(() => {
          router.push("/dashboard");
        }, 2000);
      } catch (err: any) {
        setStatus("error");
        setErrorMsg(err.response?.data?.error?.message || "Failed to accept invitation. It may have expired or is invalid.");
      }
    };

    acceptInvite();
  }, [isLoading, isAuthenticated, token, status, router, setUser]);

  // Loading global auth state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  // Not authenticated view
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full bg-surface/30 backdrop-blur-md border border-border/50 rounded-3xl p-8 shadow-lg text-center space-y-6">
          <div className="mx-auto h-12 w-12 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">You've been invited!</h1>
            <p className="text-sm text-muted">
              You need to log in or create an account to accept this team invitation.
            </p>
          </div>
          
          <div className="flex flex-col gap-3 pt-4">
            <Link
              href={`/login?redirect=/invite/${token}`}
              className="w-full flex items-center justify-center py-3.5 rounded-xl bg-brand text-sm font-semibold text-white hover:bg-brand-mid transition-all"
            >
              Log In
            </Link>
            <Link
              href={`/register?redirect=/invite/${token}`}
              className="w-full flex items-center justify-center py-3.5 rounded-xl border border-border bg-surface-2 text-sm font-semibold text-foreground hover:bg-surface transition-all"
            >
              Create Account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Processing the invite or result
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full bg-surface/30 backdrop-blur-md border border-border/50 rounded-3xl p-8 shadow-lg text-center space-y-6">
        {status === "loading" || status === "idle" ? (
          <div className="flex flex-col items-center space-y-4 py-4">
            <Loader2 className="h-10 w-10 animate-spin text-brand" />
            <h2 className="text-xl font-semibold text-foreground">Accepting Invitation...</h2>
            <p className="text-sm text-muted">Please wait while we add you to the team.</p>
          </div>
        ) : status === "success" ? (
          <div className="flex flex-col items-center space-y-4 py-4">
            <div className="h-16 w-16 rounded-full bg-brand/10 text-brand flex items-center justify-center animate-bounce-slow">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">Welcome to the Team!</h2>
            <p className="text-sm text-muted">You have successfully joined the team. Redirecting you to the dashboard...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-4 py-4">
            <div className="h-16 w-16 rounded-full bg-error-subtle text-error flex items-center justify-center">
              <AlertCircle className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">Invitation Failed</h2>
            <p className="text-sm text-error font-medium">{errorMsg}</p>
            <div className="pt-4 w-full">
              <Link
                href="/dashboard"
                className="w-full flex items-center justify-center py-3.5 rounded-xl border border-border bg-surface-2 text-sm font-semibold text-foreground hover:bg-surface transition-all"
              >
                Go to Dashboard
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
