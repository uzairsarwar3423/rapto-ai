import { cn } from "@/lib/utils";
import type { IntegrationCategory } from "@/lib/marketing/content/integrations-page.content";

interface IntegrationCategoryBadgeProps {
  category: IntegrationCategory;
  className?: string;
}

export function IntegrationCategoryBadge({
  category,
  className,
}: IntegrationCategoryBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[var(--color-surface)] text-[var(--color-muted-subtle)] border border-[var(--color-border)] select-none",
        className
      )}
    >
      {category}
    </span>
  );
}
