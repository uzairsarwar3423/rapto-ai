import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../store/auth.store';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

export function SessionExpiredModal() {
  const isSessionExpired = useAuthStore((state) => state.isSessionExpired);
  const setSessionExpired = useAuthStore((state) => state.setSessionExpired);
  const router = useRouter();

  const handleLogin = () => {
    setSessionExpired(false);
    router.push('/login?reason=session_expired');
  };

  return (
    <AnimatePresence>
      {isSessionExpired && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-0">
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
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface-2 p-8 shadow-xl"
          >
            <div className="flex flex-col items-center text-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand/10 text-brand">
                <LogOut className="h-8 w-8" />
              </div>
              
              <h2 className="mb-2 text-2xl font-semibold tracking-tight text-foreground">
                Session Expired
              </h2>
              
              <p className="mb-8 text-sm text-muted">
                Your session has expired due to inactivity or a security update. Please log in again to continue.
              </p>
              
              <button
                onClick={handleLogin}
                className="flex w-full items-center justify-center rounded-xl bg-brand px-4 py-3 text-sm font-medium text-white shadow-brand transition-all hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-background"
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
