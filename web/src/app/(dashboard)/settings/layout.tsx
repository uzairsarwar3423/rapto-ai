import type { ReactNode } from "react";
import { PageContainer } from "@/components/shared/layout/PageContainer";
import { SettingsSidebar } from "@/shared/components/layout/SettingsSidebar";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <PageContainer className="flex flex-col md:flex-row gap-5 md:gap-8 max-w-6xl w-full px-4 sm:px-6 py-4 sm:py-6">
      <SettingsSidebar />
      <div className="flex-1 min-w-0">{children}</div>
    </PageContainer>
  );
}

