"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "ghost" | "outline";
type ButtonSize    = "default" | "lg";

interface MarketingButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  isExternal?: boolean;
  id?: string;
  type?: "button" | "submit" | "reset";
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: [
    "bg-black text-white border border-black",
    "hover:bg-accent hover:border-accent",
    "active:scale-[0.98]",
  ].join(" "),

  ghost: [
    "bg-transparent text-gray-4 border border-transparent",
    "hover:text-black",
    "active:scale-[0.98]",
  ].join(" "),

  outline: [
    "bg-transparent text-black border border-gray-2",
    "hover:border-black hover:bg-gray-1",
    "active:scale-[0.98]",
  ].join(" "),
};

const sizeStyles: Record<ButtonSize, string> = {
  default: "px-[18px] py-[9px] text-sm",
  lg:      "px-7 py-[13px] text-[15px]",
};

const baseStyles = [
  "inline-flex items-center justify-center gap-2",
  "font-sans font-medium leading-none",
  "rounded-[--radius] cursor-pointer",
  "transition-all duration-200 ease-out",
  "select-none outline-none",
  "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
  "disabled:opacity-50 disabled:cursor-not-allowed",
  // Hover lift for primary variant
  "[&.variant-primary]:hover:-translate-y-px",
].join(" ");

export function MarketingButton({
  variant = "primary",
  size = "default",
  href,
  onClick,
  children,
  className,
  isExternal,
  id,
  type = "button",
}: MarketingButtonProps) {
  const classes = cn(
    baseStyles,
    variantStyles[variant],
    sizeStyles[size],
    variant === "primary" && "hover:-translate-y-px",
    className
  );

  if (href) {
    const externalProps = isExternal
      ? { target: "_blank", rel: "noopener noreferrer" }
      : {};

    return (
      <Link href={href} className={classes} id={id} {...externalProps}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} className={classes} id={id}>
      {children}
    </button>
  );
}
