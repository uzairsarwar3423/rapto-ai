"use client";

import { motion } from "framer-motion";

export function FullPageSpinner() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
      <motion.div
        className="h-10 w-10 rounded-full border-4 border-brand-subtle border-t-brand"
        animate={{ rotate: 360 }}
        transition={{
          repeat: Infinity,
          ease: "linear",
          duration: 0.8,
        }}
      />
      <p className="mt-4 text-sm font-medium text-muted">
        Loading...
      </p>
    </div>
  );
}
