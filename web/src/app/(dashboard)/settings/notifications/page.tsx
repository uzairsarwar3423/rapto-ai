import type { Metadata } from 'next';
import { SettingsPlaceholder } from '@/shared/components/layout/SettingsPlaceholder';

export const metadata: Metadata = {
  title: 'Notifications Settings',
  description: 'Manage personal alerts, weekly summaries, and custom activity flags.',
};

export default function NotificationsSettingsPage() {
  return (
    <SettingsPlaceholder
      title="Notifications"
      description="Configure email alerts, daily highlights, and custom team commitment updates."
      comingDay={43}
    />
  );
}
