import type { ReactNode } from "react";
import { PageContainer } from "@/components/shared/layout/PageContainer";
import { SettingsSidebar } from "@/shared/components/layout/SettingsSidebar";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <PageContainer className="flex gap-6 max-w-5xl">
      <SettingsSidebar />
      <div className="flex-1 min-w-0 py-4">{children}</div>
    </PageContainer>
  );
}
