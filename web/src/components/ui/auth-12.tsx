"use client";

import React, { useState } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import { ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons";
import { OrganicShader } from "@/components/ui/OrganicShader";

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
  /** Logo for the dark shader panel (light text). */
  brandLogo?: React.ReactNode;
  /** Logo for the light form background on small screens (dark text). */
  brandLogoDark?: React.ReactNode;
}

export const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.08,
    },
  },
};

export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 320,
      damping: 28,
    },
  },
};

/** Shader card — shared by the desktop side panel and the mobile header strip. */
function ShaderCard({
  className,
  logo,
  radius,
}: {
  className?: string;
  logo?: React.ReactNode;
  radius: string;
}) {
  return (
    <div
      className={`relative overflow-hidden bg-[#050a07] shadow-[0_1px_2px_rgba(5,20,10,0.25),0_28px_60px_-28px_rgba(5,30,14,0.55)] ${radius} ${className ?? ""}`}
    >
      {/* Held as a still frame: textured and composed, but no motion */}
      <OrganicShader animated={false} stillTime={14} />
      {/* Hairline inner light so the edge reads as a lit surface */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/[0.09] ${radius}`}
      />
      {logo && (
        <div className="absolute left-8 top-8 z-10 flex items-center gap-3">{logo}</div>
      )}
    </div>
  );
}

export default function Auth12({
  mode = "login",
  title,
  subtitle,
  children,
  brandLogo,
  brandLogoDark,
}: Auth12Props) {
  const [showPassword, setShowPassword] = useState(false);
  const reduceMotion = useReducedMotion();

  const logo = brandLogo || (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="10" fill="#1A6B3C" />
      <path d="M12 24.5L25 12.5C26 11.5 28 11.5 29 12.5C30 13.5 30 15 29 16L16 28L12 24.5Z" fill="white" />
      <path d="M10 18.5L23 6.5C24 5.5 26 5.5 27 6.5C28 7.5 28 9 27 10L14 22L10 18.5Z" fill="white" fillOpacity="0.8" />
    </svg>
  );

  return (
    <div className="flex min-h-screen w-full flex-col bg-paper font-sans text-ink antialiased selection:bg-ink selection:text-white supports-[height:100dvh]:min-h-dvh lg:flex-row">
      {/* Phones & tablets: no shader — just the brand above the form. The shader
          panel below is display:none here, so no WebGL context is ever created. */}
      <header className="flex items-center px-5 pt-6 min-[400px]:px-6 sm:px-12 lg:hidden [@media(max-height:500px)]:pt-4">
        {brandLogoDark ?? logo}
      </header>

      {/* Desktop (lg+): full-height shader panel */}
      <div className="relative hidden w-1/2 flex-col p-4 lg:flex lg:min-h-screen lg:supports-[height:100dvh]:min-h-dvh">
        <ShaderCard className="h-full w-full" radius="rounded-[24px]" logo={logo} />
      </div>

      {/* Form panel */}
      <div className="flex w-full flex-1 flex-col items-center justify-center px-5 py-8 min-[400px]:px-6 min-[400px]:py-10 sm:px-12 lg:w-1/2 lg:flex-none lg:py-12 [@media(max-height:500px)]:py-6!">
        <motion.div
          variants={containerVariants}
          initial={reduceMotion ? false : "hidden"}
          animate="visible"
          className="w-full max-w-[400px]"
        >
          {/* Header */}
          <motion.div variants={itemVariants} className="mb-9">
            <h1
              className={`mb-4 text-ink ${
                mode === "register"
                  ? "auth-title-sans text-[38px] leading-[1.1] tracking-[-0.035em] sm:text-[44px]"
                  : "auth-title text-[48px] leading-[0.98] tracking-[-0.03em] sm:text-[56px]"
              }`}
            >
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
            <p className="max-w-[22rem] text-pretty text-[15px] leading-[1.6] tracking-[-0.005em] text-ink-2">
              {subtitle || (mode === "login"
                ? "You need to be signed in to access the project dashboard."
                : "Sign up in seconds to get started with AI meeting tracking.")}
            </p>
          </motion.div>

          {/* Children / Form */}
          {children || (
            <form className="flex flex-col gap-5">
              <motion.div variants={itemVariants} className="flex flex-col gap-2">
                <label htmlFor="email" className="text-[13px] font-medium tracking-[-0.003em] text-ink">
                  Email or username
                </label>
                <input
                  id="email"
                  type="text"
                  placeholder="alex.costa@example.com"
                  className="auth-input"
                />
              </motion.div>

              <motion.div variants={itemVariants} className="flex flex-col gap-2">
                <label htmlFor="password" className="text-[13px] font-medium tracking-[-0.003em] text-ink">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    className="auth-input pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-ink-3 transition-colors hover:text-ink"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    <HugeiconsIcon icon={showPassword ? ViewIcon : ViewOffIcon} className="size-[18px]" />
                  </button>
                </div>
              </motion.div>

              <motion.div variants={itemVariants} className="mt-2">
                <button type="submit" className="btn-ink-grain w-full">
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
