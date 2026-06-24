import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthGuard } from "@/features/auth/components/AuthGuard";
import { AppShellClientWrapper } from "./AppShellClientWrapper";
import { cookies } from "next/headers";

export const metadata: Metadata = {
  title: "Dashboard",
};

/**
 * Dashboard layout — App shell after login.
 * Wrapped in AuthGuard to protect routes.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const defaultCollapsed = cookieStore.get("sidebar:collapsed")?.value === "true";

  return (
    <AuthGuard>
      <AppShellClientWrapper defaultCollapsed={defaultCollapsed}>
        {children}
      </AppShellClientWrapper>
    </AuthGuard>
  );
}
