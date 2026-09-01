"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../store/auth.store';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

export function SessionExpiredModal() {
  const isSessionExpired = useAuthStore((state) => state.isSessionExpired);
  const setSessionExpired = useAuthStore((state) => state.setSessionExpired);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const router = useRouter();

  const handleLogin = () => {
    const currentPath = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '';
    clearAuth();
    setSessionExpired(false);

    if (currentPath && currentPath !== '/' && !currentPath.startsWith('/login') && !currentPath.startsWith('/register')) {
      router.push(`/login?reason=session_expired&redirect=${encodeURIComponent(currentPath)}`);
    } else {
      router.push('/login?reason=session_expired');
    }
  };

  return (
    <AnimatePresence>
      {isSessionExpired && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-0 select-none">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-2xl font-sans"
          >
            <div className="flex flex-col items-center text-center">
              <div className="mb-5 flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-brand/10 text-brand">
                <LogOut className="h-7 w-7 sm:h-8 sm:w-8" />
              </div>

              <h2 className="mb-2 text-xl sm:text-2xl font-heading font-semibold tracking-tight text-foreground">
                Session Expired
              </h2>

              <p className="mb-6 sm:mb-8 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Your session has expired due to inactivity or a security update. Please log in again to continue.
              </p>

              <button
                type="button"
                onClick={handleLogin}
                className="flex w-full items-center justify-center rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-brand transition-all hover:bg-brand-hover hover:scale-[1.01] active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-background cursor-pointer"
              >
                Log In Again
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
