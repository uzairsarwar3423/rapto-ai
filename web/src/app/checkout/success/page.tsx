"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ArrowRight, Sparkles } from "lucide-react";
import { syncSubscription } from "@/features/billing/api/billing.api";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

export default function CheckoutSuccessPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [countdown, setCountdown] = useState(5);
  const [isSynced, setIsSynced] = useState(false);

  useEffect(() => {
    // 1. Trigger background subscription sync to immediately upgrade client state
    syncSubscription()
      .then(() => {
        setIsSynced(true);
        queryClient.invalidateQueries({ queryKey: ["team"] });
        queryClient.invalidateQueries({ queryKey: ["subscription"] });
        queryClient.invalidateQueries({ queryKey: ["billing"] });
      })
      .catch((err) => {
        console.warn("Auto-sync background check:", err);
      });

    // 2. Countdown redirect
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push("/settings/billing?success=true");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [queryClient, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center space-y-6 p-8 border border-border bg-card rounded-2xl shadow-sm">
        <div className="flex justify-center">
          <div className="relative">
            <div className="h-16 w-16 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500 animate-in zoom-in duration-300">
              <CheckCircle2 className="h-9 w-9" />
            </div>
            <div className="absolute -top-1 -right-1 bg-primary text-primary-foreground p-1 rounded-full animate-bounce">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold font-heading text-foreground tracking-tight">
            Payment Successful!
          </h1>
          <p className="text-sm text-muted-foreground">
            Thank you for upgrading your plan. Your new workspace features and increased quotas are now active.
          </p>
        </div>

        <div className="py-2">
          <p className="text-xs text-muted-foreground/70">
            Redirecting to billing settings in <span className="font-semibold text-foreground">{countdown}s</span>...
          </p>
        </div>

        <div className="flex flex-col gap-2.5 pt-2">
          <Button
            asChild
            className="w-full h-10 font-medium"
          >
            <Link href="/settings/billing?success=true">
              View Billing & Invoices
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>

          <Button
            variant="outline"
            asChild
            className="w-full h-10 font-medium"
          >
            <Link href="/dashboard">
              Go to Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
