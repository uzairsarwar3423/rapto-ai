"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { IntegrationItem } from "@/lib/marketing/content/integrations-page.content";
import { IntegrationCard } from "../ui/IntegrationCard";

interface IntegrationsGridProps {
  integrations: IntegrationItem[];
}

export function IntegrationsGrid({ integrations }: IntegrationsGridProps) {
  // Sort integrations to put featured (with deep dive) first, then live, then coming soon
  const sortedIntegrations = [...integrations].sort((a, b) => {
    if (a.hasDeepDive && !b.hasDeepDive) return -1;
    if (!a.hasDeepDive && b.hasDeepDive) return 1;
    if (a.status === "live" && b.status === "coming_soon") return -1;
    if (a.status === "coming_soon" && b.status === "live") return 1;
    return 0;
  });

  return (
    <section className="bg-white py-16 px-6">
      <div className="max-w-[1120px] mx-auto">
        <motion.div
          layout
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6"
        >
          <AnimatePresence mode="popLayout">
            {sortedIntegrations.map((integration) => (
              <motion.div
                key={integration.slug}
                layoutId={integration.slug}
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="h-full"
              >
                <IntegrationCard integration={integration} className="h-full" />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>

        {sortedIntegrations.length === 0 && (
          <div className="py-20 text-center text-[var(--color-muted)] font-sans">
            No integrations found matching this category.
          </div>
        )}
      </div>
    </section>
  );
}
