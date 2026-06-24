import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * cn() — Conditional Tailwind class utility
 *
 * Combines clsx (conditional class logic) with tailwind-merge
 * (deduplication of conflicting Tailwind classes).
 *
 * Example:
 *   cn("text-gray-4", isActive && "text-accent")
 *   → If isActive: "text-accent"  (text-gray-4 is removed by twMerge)
 *   → If not:      "text-gray-4"
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
