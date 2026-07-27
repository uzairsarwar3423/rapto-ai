"use client";

import React from "react";
import { NavLogo } from "./NavLogo";

interface LogoIconProps {
  /** Size modifier for font size calculation */
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  priority?: boolean;
}

export function LogoIcon({
  size = 32,
  className,
  style,
}: LogoIconProps) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", fontSize: `${Math.max(16, size / 1.25)}px`, ...style }}>
      <NavLogo href="" className={className} />
    </div>
  );
}
