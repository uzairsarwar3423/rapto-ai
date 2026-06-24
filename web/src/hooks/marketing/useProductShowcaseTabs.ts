"use client";

import { useState } from "react";
import type { ProductTab } from "@/lib/marketing/content/product-tabs.content";

/**
 * useProductShowcaseTabs
 * Manages active tab state for the ProductShowcase section.
 */
export function useProductShowcaseTabs(tabs: ProductTab[]) {
  const [activeTab, setActiveTab] = useState<ProductTab["id"]>(tabs[0].id);

  const activeTabData = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  return {
    activeTab,
    activeTabData,
    setActiveTab,
  };
}
