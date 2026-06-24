"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";
import {
  integrationsData,
  IntegrationItem,
  IntegrationCategory,
} from "@/lib/marketing/content/integrations-page.content";

export function useIntegrationFilter() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  // Get active category from URL (?category=some-category)
  const categoryParam = searchParams.get("category");
  
  // Map URL parameter back to category label or default to "All"
  const activeCategory = categoryParam ? decodeURIComponent(categoryParam) : "All";

  // Filter the integrations list based on the active category
  const filteredIntegrations = integrationsData.filter((item) => {
    if (activeCategory === "All") return true;
    return item.categories.includes(activeCategory as IntegrationCategory);
  });

  const setCategory = (category: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (category === "All") {
      params.delete("category");
    } else {
      params.set("category", encodeURIComponent(category));
    }

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  return {
    activeCategory,
    filteredIntegrations,
    setCategory,
    isPending,
  };
}
