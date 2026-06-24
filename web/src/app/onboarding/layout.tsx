"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Check, Users, ShieldAlert, Calendar, Layout } from "lucide-react";
import Link from "next/link";
import { AuthGuard } from "@/features/auth/components/AuthGuard";

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Determine current step index
  let stepIndex = 1;
  let progressWidth = "25%";

  if (pathname.includes("/create-team")) {
    stepIndex = 2;
    progressWidth = "50%";
  } else if (pathname.includes("/invite-team")) {
    stepIndex = 3;
    progressWidth = "75%";
  } else if (pathname.includes("/connect-calendar")) {
    stepIndex = 4;
    progressWidth = "100%";
  }

  const steps = [
    { number: 1, label: "Welcome", icon: Layout, href: "/onboarding" },
    { number: 2, label: "Team Profile", icon: Users, href: "/onboarding/create-team" },
    { number: 3, label: "Invite", icon: ShieldAlert, href: "/onboarding/invite-team" },
    { number: 4, label: "Calendar", icon: Calendar, href: "/onboarding/connect-calendar" },
  ];

  return (
    <AuthGuard>
      <div className="min-h-screen w-full flex flex-col bg-background text-foreground transition-colors duration-300">
      {/* Dynamic Progress Indicator Bar */}
      <div className="w-full h-1 bg-border/40 relative">
        <div
          className="absolute left-0 top-0 bottom-0 bg-brand transition-all duration-500 ease-out"
          style={{ width: progressWidth }}
        />
      </div>

      <header className="w-full max-w-6xl mx-auto px-6 pt-8 pb-4 flex flex-col md:flex-row items-center justify-between gap-6 border-b border-border/10">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-brand flex items-center justify-center text-white font-bold text-lg shadow-brand">
            V
          </div>
          <span className="font-semibold text-lg tracking-tight">Vocaply</span>
        </div>

        {/* Desktop Step Timeline */}
        <div className="hidden md:flex items-center gap-8">
          {steps.map((step) => {
            const isCompleted = stepIndex > step.number;
            const isActive = stepIndex === step.number;
            const Icon = step.icon;

            return (
              <Link
                key={step.number}
                href={step.href}
                className={`flex items-center gap-2.5 transition-all duration-300 ${
                  isActive ? "text-brand font-medium scale-105" : isCompleted ? "text-brand/80 hover:text-brand" : "text-muted/60 pointer-events-none"
                }`}
              >
                <div
                  className={`h-7 w-7 rounded-full flex items-center justify-center text-xs border transition-all duration-300 ${
                    isActive
                      ? "bg-brand/10 border-brand text-brand shadow-sm font-semibold"
                      : isCompleted
                      ? "bg-brand text-white border-brand hover:shadow-brand"
                      : "bg-surface border-border text-muted"
                  }`}
                >
                  {isCompleted ? <Check className="h-3.5 w-3.5" /> : step.number}
                </div>
                <span className="text-xs tracking-wide uppercase">{step.label}</span>
              </Link>
            );
          })}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 md:py-16">
        <div className="w-full max-w-lg">
          {/* Glassmorphic Card */}
          <div className="bg-surface/30 backdrop-blur-md border border-border/50 rounded-3xl p-8 shadow-lg relative overflow-hidden transition-all duration-300 hover:shadow-xl">
            {/* Subtle light pulse background */}
            <div className="absolute -top-40 -left-40 h-80 w-80 rounded-full bg-brand/5 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-brand/5 blur-3xl pointer-events-none" />
            
            <div className="relative z-10">
              {children}
            </div>
          </div>

          {/* Small Mobile Indicator */}
          <div className="mt-6 text-center md:hidden">
            <span className="text-xs text-muted font-medium">
              Step {stepIndex} of 4: {steps[stepIndex - 1].label}
            </span>
          </div>
        </div>
      </main>
    </div>
    </AuthGuard>
  );
}
