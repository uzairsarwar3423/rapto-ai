"use client";

import React, { useState, useEffect } from "react";
import { 
  CheckCircle2, 
  Play, 
  RotateCcw, 
  Brain, 
  ArrowRight, 
  User, 
  Sparkles,
  Layers,
  Check
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// 1. Mock Linear Integration Component
// ============================================================================
export function MockLinearIntegration() {
  const [issueStatus, setIssueStatus] = useState<"in_progress" | "done">("in_progress");

  return (
    <div className="w-full border border-[var(--color-border)] rounded-xl overflow-hidden bg-white shadow-sm mt-4 font-sans max-w-[650px]">
      {/* Linear Window Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#FAF9F6] border-b border-[var(--color-border)] select-none">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#E5E5E0]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#E5E5E0]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#E5E5E0]" />
          </div>
          <span className="text-[11px] font-mono text-[var(--color-muted)] font-medium ml-2">Linear — Issue LIN-284</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-muted-subtle)] font-medium">
          <span>Active Integration</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand)] animate-pulse" />
        </div>
      </div>

      {/* Main Issue Card */}
      <div className="p-5 flex flex-col md:flex-row gap-5">
        {/* Issue Details */}
        <div className="flex-grow flex flex-col justify-between min-h-[160px]">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-1.5 py-0.5 rounded bg-[#F1F0EC] border border-[var(--color-border)] font-mono text-[10px] font-semibold text-[var(--color-muted)] tracking-wider">
                LIN-284
              </span>
              <span className="text-[11px] font-medium text-[var(--color-muted)]">
                Integrations / Webhook Sync
              </span>
            </div>
            <h4 className="text-[15px] font-bold text-[var(--color-foreground)] tracking-tight mb-2">
              Integrate Apple Pay Stripe handler in checkout flow
            </h4>
            <p className="text-xs text-[var(--color-muted)] font-light leading-relaxed mb-4">
              Implement the webhook receiver endpoint to process apple-pay transactions and resolve pending session states.
            </p>
          </div>

          {/* Rapto Linked Activity */}
          <div className="bg-[var(--color-brand-subtle)] border border-[color-mix(in_srgb,var(--color-brand)_15%,transparent)] rounded-lg p-3 flex gap-2.5 items-start">
            <div className="h-6 w-6 rounded-full bg-[var(--color-brand)] flex items-center justify-center text-white flex-shrink-0 shadow-sm mt-0.5">
              <Sparkles className="w-3 h-3" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[11px] font-semibold text-[var(--color-brand)]">Rapto Sync</span>
                <span className="text-[9px] text-[var(--color-muted-subtle)] font-mono">Auto-linked</span>
              </div>
              <p className="text-[11px] text-[var(--color-muted)] font-light leading-snug">
                Extracted from standup: <span className="italic font-normal">&quot;Ahmed: I will integrate Apple Pay checkout handler by next Thursday.&quot;</span>
              </p>
              {issueStatus === "done" && (
                <div className="flex items-center gap-1.5 mt-2 text-[10px] font-semibold text-[var(--color-brand)] animate-in fade-in slide-in-from-top-1 duration-200">
                  <Check className="w-3 h-3" />
                  <span>Rapto Commitment Auto-Fulfilled</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Status Attributes */}
        <div className="w-full md:w-48 bg-[#FAF9F6] border border-[var(--color-border)] rounded-lg p-4 flex flex-col gap-4 flex-shrink-0">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-subtle)] block mb-1.5">
              Status
            </span>
            <button
              onClick={() => setIssueStatus(issueStatus === "in_progress" ? "done" : "in_progress")}
              className={cn(
                "w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-semibold border transition-all duration-200 cursor-pointer select-none shadow-2xs",
                issueStatus === "done"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                  : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
              )}
            >
              <span className="flex items-center gap-1.5">
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  issueStatus === "done" ? "bg-emerald-500" : "bg-amber-500 animate-pulse"
                )} />
                {issueStatus === "done" ? "Done" : "In Progress"}
              </span>
              <span className="text-[9px] opacity-60">Toggle</span>
            </button>
          </div>

          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-subtle)] block mb-1">
              Assignee
            </span>
            <div className="flex items-center gap-2">
              <div className="h-5.5 w-5.5 rounded-full bg-[#E2B33C] text-white flex items-center justify-center text-[10px] font-semibold shadow-xs">
                AH
              </div>
              <span className="text-xs text-[var(--color-foreground)] font-medium">Ahmed Hassan</span>
            </div>
          </div>

          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-subtle)] block mb-1">
              Reporter
            </span>
            <div className="flex items-center gap-1 text-[var(--color-brand)] font-semibold text-xs">
              <Brain className="w-3.5 h-3.5" />
              <span>Rapto (AI)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 2. Mock Live Score Ring Component
// ============================================================================
export function MockScoreRing() {
  const [score, setScore] = useState(78);
  const [isAnimating, setIsAnimating] = useState(false);
  const [actionDone, setActionDone] = useState(false);

  const radius = 40;
  const stroke = 6;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const triggerUpdate = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    setActionDone(true);
    
    // Animate score from 78 to 85 step by step
    let current = 78;
    const interval = setInterval(() => {
      current += 1;
      setScore(current);
      if (current >= 85) {
        clearInterval(interval);
        setIsAnimating(false);
      }
    }, 100);
  };

  const resetUpdate = () => {
    setScore(78);
    setActionDone(false);
    setIsAnimating(false);
  };

  return (
    <div className="w-full border border-[var(--color-border)] rounded-xl overflow-hidden bg-white shadow-sm mt-4 font-sans max-w-[650px]">
      <div className="px-4 py-2.5 bg-[#FAF9F6] border-b border-[var(--color-border)] flex items-center justify-between select-none">
        <span className="text-[11px] font-mono text-[var(--color-muted)] font-medium">Live Accountability Widget</span>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-mono text-emerald-700 font-semibold uppercase">Real-time update</span>
        </div>
      </div>

      <div className="p-6 flex flex-col sm:flex-row items-center justify-between gap-6">
        {/* Left Side: Score ring */}
        <div className="flex items-center gap-5">
          <div className="relative flex items-center justify-center">
            <svg
              height={radius * 2}
              width={radius * 2}
              className="transform -rotate-90"
            >
              {/* Background ring */}
              <circle
                stroke="#F1F0EC"
                fill="transparent"
                strokeWidth={stroke}
                r={normalizedRadius}
                cx={radius}
                cy={radius}
              />
              {/* Foreground ring */}
              <circle
                stroke="var(--color-brand)"
                fill="transparent"
                strokeWidth={stroke}
                strokeDasharray={circumference + " " + circumference}
                style={{ strokeDashoffset, transition: "stroke-dashoffset 0.15s ease" }}
                strokeLinecap="round"
                r={normalizedRadius}
                cx={radius}
                cy={radius}
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-xl font-bold font-mono text-[var(--color-foreground)] leading-none">
                {score}%
              </span>
              <span className="text-[8px] uppercase tracking-wider text-[var(--color-muted-subtle)] font-bold mt-0.5">
                Score
              </span>
            </div>
          </div>

          <div>
            <h5 className="text-xs font-bold text-[var(--color-foreground)] mb-0.5">
              Team accountability rating
            </h5>
            <p className="text-[11px] text-[var(--color-muted)] font-light leading-relaxed">
              Updates fluidly when commitments are fulfilled.
            </p>
            {actionDone && (
              <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded bg-emerald-50 text-[9px] font-semibold text-emerald-700 border border-emerald-100 animate-in zoom-in-95 duration-200">
                <Sparkles className="w-2.5 h-2.5 text-emerald-600" />
                Score increased (+7%)
              </span>
            )}
          </div>
        </div>

        {/* Right Side: Demo Trigger Buttons */}
        <div className="w-full sm:w-auto flex flex-col gap-2">
          {!actionDone ? (
            <button
              onClick={triggerUpdate}
              className="w-full sm:w-44 px-3.5 py-2 text-xs font-semibold rounded-md bg-[var(--color-brand)] hover:bg-[var(--color-brand-mid)] text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer select-none shadow-xs"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Fulfil Commitments</span>
            </button>
          ) : (
            <button
              onClick={resetUpdate}
              disabled={isAnimating}
              className="w-full sm:w-44 px-3.5 py-2 text-xs font-semibold rounded-md border border-[var(--color-border)] bg-white hover:bg-[#FAF9F6] text-[var(--color-muted)] flex items-center justify-center gap-1.5 transition-colors cursor-pointer select-none disabled:opacity-50"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Demo</span>
            </button>
          )}
          <span className="text-[9px] text-center text-[var(--color-muted-subtle)] font-mono leading-none select-none">
            Click button to test update
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 3. Mock Cross-Meeting Memory Component
// ============================================================================
export function MockCrossMeetingMemory() {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  useEffect(() => {
    // Autoplay through steps
    const timer = setInterval(() => {
      setCurrentStep((prev) => (prev === 3 ? 1 : (prev + 1) as 1 | 2 | 3));
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full border border-[var(--color-border)] rounded-xl overflow-hidden bg-white shadow-sm mt-4 font-sans max-w-[650px]">
      <div className="px-4 py-2.5 bg-[#FAF9F6] border-b border-[var(--color-border)] flex items-center justify-between select-none">
        <span className="text-[11px] font-mono text-[var(--color-muted)] font-medium">Interactive Pipeline Demo</span>
        <div className="flex gap-1.5">
          {[1, 2, 3].map((s) => (
            <button
              key={s}
              onClick={() => setCurrentStep(s as 1 | 2 | 3)}
              className={cn(
                "w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold border transition-colors cursor-pointer",
                currentStep === s
                  ? "bg-[var(--color-brand)] text-white border-transparent"
                  : "bg-white text-[var(--color-muted)] border-[var(--color-border)] hover:bg-[#FAF9F6]"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 flex flex-col gap-4 min-h-[220px]">
        {/* Step Contents */}
        {currentStep === 1 && (
          <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-muted)]">
              <Layers className="w-3.5 h-3.5 text-[var(--color-muted-subtle)]" />
              <span>Step 1: The Commitment (Meeting A — May 8)</span>
            </div>
            
            <div className="bg-[#FAF9F6] border border-[var(--color-border)] rounded-lg p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="h-5 w-5 rounded-full bg-[#E2B33C] text-white flex items-center justify-center text-[9px] font-semibold">
                  AH
                </div>
                <span className="text-xs font-semibold text-[var(--color-foreground)]">Ahmed Hassan</span>
                <span className="text-[9px] text-[var(--color-muted-subtle)] ml-auto">Transcript quote</span>
              </div>
              <p className="text-xs text-[var(--color-foreground)] leading-relaxed italic bg-white p-2.5 rounded border border-[var(--color-border)] font-light">
                &quot;I will finish writing the Apple Pay integrations and deploy the Stripe handler by next Thursday.&quot;
              </p>
              <div className="flex items-center gap-1.5 mt-3 text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded w-fit border border-amber-100">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span>Pending Commitment Created</span>
              </div>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-muted)]">
              <Layers className="w-3.5 h-3.5 text-[var(--color-muted-subtle)]" />
              <span>Step 2: The Update Spoken (Meeting B — May 15)</span>
            </div>
            
            <div className="bg-[#FAF9F6] border border-[var(--color-border)] rounded-lg p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="h-5 w-5 rounded-full bg-[#E2B33C] text-white flex items-center justify-center text-[9px] font-semibold">
                  AH
                </div>
                <span className="text-xs font-semibold text-[var(--color-foreground)]">Ahmed Hassan</span>
                <span className="text-[9px] text-[var(--color-muted-subtle)] ml-auto">Transcript quote</span>
              </div>
              <p className="text-xs text-[var(--color-foreground)] leading-relaxed italic bg-white p-2.5 rounded border border-[var(--color-border)] font-light">
                &quot;Just an update, Stripe webhook handlers for Apple Pay are completely code-complete and deployed to dev.&quot;
              </p>
              <div className="flex items-center gap-1.5 mt-3 text-[10px] font-semibold text-[#4F46E5] bg-[#EEF2FF] px-2 py-0.5 rounded w-fit border border-[#4F46E5]/10">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4F46E5] animate-pulse" />
                <span>New Meeting Transcript Processed</span>
              </div>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-muted)]">
              <Brain className="w-3.5 h-3.5 text-[var(--color-brand)] animate-pulse" />
              <span className="text-[var(--color-brand)] font-semibold">Step 3: Cross-Meeting Match (AI Engine)</span>
            </div>
            
            <div className="flex flex-col md:flex-row gap-3 items-stretch">
              <div className="flex-1 bg-[#FAF9F6] border border-[var(--color-border)] rounded-lg p-3 flex flex-col justify-between">
                <div>
                  <span className="text-[9px] font-bold text-[var(--color-muted)] block mb-1">MAY 8 COMMITMENT</span>
                  <p className="text-[11px] text-[var(--color-muted)] font-light italic leading-snug">
                    &quot;...Apple Pay integrations... by next Thursday&quot;
                  </p>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-[9px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded w-fit border border-emerald-100 font-semibold">
                  <Check className="w-2.5 h-2.5" />
                  <span>Auto-Fulfilled</span>
                </div>
              </div>

              <div className="flex items-center justify-center p-2">
                <div className="h-7 w-7 rounded-full bg-[var(--color-brand)] flex items-center justify-center text-white shadow-sm animate-pulse">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
              </div>

              <div className="flex-1 bg-[#FAF9F6] border border-[var(--color-border)] rounded-lg p-3 flex flex-col justify-between">
                <div>
                  <span className="text-[9px] font-bold text-[var(--color-muted)] block mb-1">MAY 15 UPDATE</span>
                  <p className="text-[11px] text-[var(--color-muted)] font-light italic leading-snug">
                    &quot;...Apple Pay... code-complete and deployed...&quot;
                  </p>
                </div>
                <div className="mt-3 flex items-center gap-1 text-[9px] text-[var(--color-brand)] bg-[var(--color-brand-subtle)] px-1.5 py-0.5 rounded w-fit border border-[color-mix(in_srgb,var(--color-brand)_10%,transparent)] font-semibold">
                  <Brain className="w-2.5 h-2.5" />
                  <span>Context Linked</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
