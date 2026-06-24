import { cn } from "@/lib/utils";

interface LiveStatusBadgeProps {
  status: "live" | "coming_soon";
  className?: string;
}

export function LiveStatusBadge({ status, className }: LiveStatusBadgeProps) {
  const isLive = status === "live";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase select-none transition-colors duration-200",
        isLive
          ? "bg-[var(--color-brand-subtle)] text-[var(--color-brand)] border border-[color-mix(in_srgb,var(--color-brand)_15%,transparent)]"
          : "bg-[var(--color-surface)] text-[var(--color-muted-subtle)] border border-[var(--color-border)]",
        className
      )}
    >
      {isLive && (
        <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-brand)] opacity-75"></span>
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[var(--color-brand)]"></span>
        </span>
      )}
      {isLive ? "Live" : "Coming Soon"}
    </span>
  );
}
