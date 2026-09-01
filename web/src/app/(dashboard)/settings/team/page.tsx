import type { Metadata } from 'next';
import { TeamSettingsForm } from '@/features/team/components/TeamSettingsForm';

export const metadata: Metadata = {
  title: 'Team Settings',
  description: 'Manage your organization settings, timezones, and weeklydigest options.',
};

export default function TeamSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-[18px] sm:text-[20px] font-semibold tracking-[-0.01em] text-foreground leading-[28px]">
          Team Settings
        </h1>
        <p className="font-sans text-xs sm:text-sm text-muted-foreground mt-1">
          Manage your organization name, slug URL, timezone defaults, and digest notifications.
        </p>
      </div>
      <TeamSettingsForm />
    </div>
  );
}
