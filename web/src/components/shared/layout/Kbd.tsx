"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface KbdProps extends React.HTMLAttributes<HTMLSpanElement> {
  keys: string[];
}

export function Kbd({ keys, className, ...props }: KbdProps) {
  const [isMac, setIsMac] = useState(true); // Default to mac representation (⌘)

  useEffect(() => {
    if (typeof window !== "undefined") {
      const platform = window.navigator.platform.toLowerCase();
      setIsMac(platform.indexOf("mac") !== -1 || platform.indexOf("iphone") !== -1 || platform.indexOf("ipad") !== -1 || platform.indexOf("ipod") !== -1);
    }
  }, []);

  const translateKey = (key: string) => {
    const k = key.toLowerCase();
    if (k === "mod" || k === "cmd" || k === "⌘") {
      return isMac ? "⌘" : "Ctrl";
    }
    if (k === "shift" || k === "⇧") {
      return isMac ? "⇧" : "Shift";
    }
    if (k === "alt" || k === "option" || k === "⌥") {
      return isMac ? "⌥" : "Alt";
    }
    // Capitalize letter keys
    if (k.length === 1) return k.toUpperCase();
    return key;
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-mono text-2xs text-muted-foreground",
        className
      )}
      {...props}
    >
      {keys.map((k, i) => (
        <kbd
          key={`${k}-${i}`}
          className="rounded-[4px] border border-border bg-surface px-1.5 py-0.5
                     leading-none shadow-[inset_0_-1px_0_var(--color-border)] select-none text-[10px]"
        >
          {translateKey(k)}
        </kbd>
      ))}
    </span>
  );
}
