"use client";

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

interface AuthCardProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export function AuthCard({ children, title, subtitle }: AuthCardProps) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-12 sm:px-6 lg:px-8">
      {/* Background radial glow */}
      <div className="absolute top-0 left-0 -translate-x-1/3 -translate-y-1/3 w-[500px] h-[500px] rounded-full bg-brand/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 translate-x-1/3 translate-y-1/3 w-[500px] h-[500px] rounded-full bg-brand/10 blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-full max-w-[420px] z-10"
      >
        {/* Brand Logo Header */}
        <div className="flex flex-col items-center mb-8">
          <Link href="/" className="group flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white font-sans font-bold text-xl shadow-brand transition-transform group-hover:scale-105">
              v
            </span>
            <span className="font-sans font-bold text-2xl tracking-tight text-foreground">
              vocaply
            </span>
          </Link>
        </div>

        {/* Card Body */}
        <div className="rounded-2xl border border-border bg-surface-2 p-8 shadow-md backdrop-blur-sm sm:p-10">
          <div className="text-center mb-6">
            <h1 className="text-h3 auth-heading font-semibold text-foreground tracking-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-2 text-sm text-muted">
                {subtitle}
              </p>
            )}
          </div>

          {children}
        </div>
      </motion.div>
    </div>
  );
}
