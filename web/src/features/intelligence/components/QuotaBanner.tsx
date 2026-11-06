"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { chatCopy } from "../copy/chatCopy";
import { quotaLevel, useChatQuota } from "../state/chatQuotaStore";
import { chatTelemetry } from "../telemetry/chatTelemetry";
import { formatDateTime } from "../utils/formatTime";

/**
 * Quiet quota notice. Renders nothing while quota is unknown (before the first answer — Day 58 has no endpoint yet).
 * Upgrade CTA only for roles that can manage billing (D-7); others are told to ask an admin.
 */
export function QuotaBanner() {
  const q = useChatQuota();
  const user = useAuthStore((s) => s.user);
  const level = quotaLevel(q);
  const shown = useRef<string | null>(null);

  useEffect(() => {
    if (level === "low" && shown.current !== "low") chatTelemetry.quotaBannerShown({ remaining: q.remaining ?? 0 });
    shown.current = level;
  }, [level, q.remaining]);

  if (level !== "low" && level !== "exhausted") return null;
  const canBuy = user?.role === "ADMIN" || (user?.role as string | undefined) === "OWNER";
  const when = q.resetsAt ? formatDateTime(new Date(q.resetsAt), user?.timezone) : null;

  return (
    <div role="status" className="mx-auto mb-1 flex max-w-3xl items-center justify-between gap-3 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs sm:text-sm">
      <span>{level === "exhausted" ? chatCopy.quotaExhausted(when) : chatCopy.quotaLow(q.remaining ?? 0)}</span>
      {level === "exhausted" &&
        (canBuy ? (
          <Link href="/settings/billing" className="font-medium underline underline-offset-2">Upgrade</Link>
        ) : (
          <span className="text-muted-foreground">Ask your admin to upgrade.</span>
        ))}
    </div>
  );
}
