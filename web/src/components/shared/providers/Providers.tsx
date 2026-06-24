"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";
import { QueryProvider } from "./QueryProvider";
import { AuthProvider } from "./AuthProvider";
import { Toaster } from "@/components/ui/sonner";

interface ProvidersProps {
  children: ReactNode;
}

/**
 * Global providers wrapper.
 * - MotionConfig: sets global Framer Motion defaults.
 *   reducedMotion="user" ensures animations are disabled for users
 *   who have enabled "reduce motion" in their OS accessibility settings.
 */
export function Providers({ children }: ProvidersProps) {
  return (
    <QueryProvider>
      <AuthProvider>
        <MotionConfig reducedMotion="user" transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}>
          {children}
        </MotionConfig>
        <Toaster />
      </AuthProvider>
    </QueryProvider>
  );
}
