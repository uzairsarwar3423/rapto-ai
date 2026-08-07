"use client";

import React, { useState } from "react";
import { motion, type Variants } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import { ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons";

// Google SVG Icon
export const GoogleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" {...props}>
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.16v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.16C1.43 8.55 1 10.22 1 12s.43 3.45 1.16 4.93l3.68-2.84z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.16 7.07l3.68 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

export interface Auth12Props {
  mode?: "login" | "register";
  title?: React.ReactNode;
  subtitle?: string;
  children?: React.ReactNode;
  imageSrc?: string;
  imageAlt?: string;
  brandLogo?: React.ReactNode;
}

export const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 24,
    },
  },
};

export default function Auth12({
  mode = "login",
  title,
  subtitle,
  children,
  imageSrc = "https://assets.watermelon.sh/auth-12.avif",
  imageAlt = "Abstract wavy gradient",
  brandLogo,
}: Auth12Props) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="flex min-h-screen w-full flex-col bg-background font-sans text-foreground antialiased selection:bg-brand/20 selection:text-brand lg:flex-row">
      {/* Left Visual Banner Panel */}
      <div className="relative hidden w-full flex-col p-4 lg:flex lg:min-h-screen lg:w-1/2">
        <div className="relative h-full w-full overflow-hidden rounded-[24px] bg-neutral-100 shadow-xl">
          <img
            src={imageSrc}
            alt={imageAlt}
            className="absolute inset-0 h-full w-full object-cover"
          />

          {/* Logo overlay */}
          <div className="absolute top-8 left-8 z-10 flex items-center gap-3">
            {brandLogo || (
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="40" height="40" rx="10" fill="#1A6B3C" />
                <path d="M12 24.5L25 12.5C26 11.5 28 11.5 29 12.5C30 13.5 30 15 29 16L16 28L12 24.5Z" fill="white"/>
                <path d="M10 18.5L23 6.5C24 5.5 26 5.5 27 6.5C28 7.5 28 9 27 10L14 22L10 18.5Z" fill="white" fillOpacity="0.8"/>
              </svg>
            )}
          </div>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="flex w-full flex-col items-center justify-center p-6 sm:p-12 lg:w-1/2">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="w-full max-w-[420px]"
        >
          {/* Header Title */}
          <motion.div variants={itemVariants} className="mb-8">
            <h1 className="mb-3 text-[42px] font-semibold leading-[1.08] tracking-tight text-foreground font-heading">
              {title || (mode === "login" ? (
                <>
                  Welcome
                  <br />
                  back
                </>
              ) : (
                <>
                  Create
                  <br />
                  account
                </>
              ))}
            </h1>
            <p className="text-[15px] text-muted text-balance">
              {subtitle || (mode === "login"
                ? "You need to be signed in to access the project dashboard."
                : "Sign up in seconds to get started with AI meeting tracking.")}
            </p>
          </motion.div>

          {/* Children / Form */}
          {children || (
            <form className="flex flex-col gap-5">
              {/* Fallback Email Input */}
              <motion.div variants={itemVariants} className="flex flex-col gap-2">
                <label htmlFor="email" className="text-[14px] font-medium text-foreground">
                  Email or username
                </label>
                <input
                  id="email"
                  type="text"
                  placeholder="alex.costa@example.com"
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[14px] text-foreground placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand transition-colors"
                />
              </motion.div>

              {/* Fallback Password Input */}
              <motion.div variants={itemVariants} className="flex flex-col gap-2">
                <label htmlFor="password" className="text-[14px] font-medium text-foreground">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 pr-10 text-[14px] text-foreground placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted hover:text-foreground transition-colors"
                  >
                    <HugeiconsIcon icon={showPassword ? ViewIcon : ViewOffIcon} className="size-5" />
                  </button>
                </div>
              </motion.div>

              {/* Submit Button */}
              <motion.div variants={itemVariants} className="mt-2">
                <button
                  type="submit"
                  className="w-full rounded-xl bg-brand py-3 text-[14px] font-medium text-white transition-transform active:scale-[0.98] hover:bg-brand-mid"
                >
                  {mode === "login" ? "Sign in" : "Create account"}
                </button>
              </motion.div>
            </form>
          )}
        </motion.div>
      </div>
    </div>
  );
}
