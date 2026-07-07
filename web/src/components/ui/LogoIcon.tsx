/**
 * LogoIcon — scalable, reusable app logo.
 * Centralized logo icon component that resolves to the chosen asset path:
 * '/icons/app/rapto1.jpeg'.
 */

import Image from "next/image";

interface LogoIconProps {
  /** Pixel size for both width and height (logo is always square). */
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Set to true when above the fold (Next.js LCP optimization). */
  priority?: boolean;
}

export function LogoIcon({
  size = 32,
  className,
  style,
  priority = false,
}: LogoIconProps) {
  return (
    <Image
      src="/icons/app/rapto1.jpeg"
      alt="Rapto"
      width={size}
      height={size}
      priority={priority}
      className={className}
      style={{
        display: "block",
        width: `${size}px`,
        height: `${size}px`,
        objectFit: "contain",
        borderRadius: "6px",
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
