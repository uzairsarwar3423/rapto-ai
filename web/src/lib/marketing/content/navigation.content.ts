import type { NavConfig } from "@/types/marketing.types";

export const navConfig: NavConfig = {
  links: [
    { label: "How it works", href: "#how-it-works", isAnchor: true },
    { label: "Features",     href: "#features",     isAnchor: true },
    { label: "Integrations", href: "#integrations", isAnchor: true },
    { label: "Pricing",      href: "/pricing" },
    { label: "Blog",         href: "/blog" },
  ],
  rightLinks: {
    signIn: "/login",
    trial:  "/register",
  },
};
