import type { Metadata } from 'next';
import { ProfileForm } from '@/features/auth/components/ProfileForm';

export const metadata: Metadata = {
  title: 'Profile Settings',
  description: 'Manage your personal user profile details, locale preferences, and avatars.',
};

export default function ProfileSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-[18px] sm:text-[20px] font-semibold tracking-[-0.01em] text-foreground leading-[28px]">
          Profile Settings
        </h1>
        <p className="font-sans text-xs sm:text-sm text-muted-foreground mt-1">
          Manage your personal details, default timezone, locale, and avatar.
        </p>
      </div>
      <ProfileForm />
    </div>
  );
}
