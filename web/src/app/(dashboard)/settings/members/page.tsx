import type { Metadata } from 'next';
import { MembersSettingsTable } from '@/features/team/components/MembersSettingsTable';

export const metadata: Metadata = {
  title: 'Team Members Settings',
  description: 'Manage active team members, view commitments, and update roles.',
};

export default function MembersSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-[18px] sm:text-[20px] font-semibold tracking-[-0.01em] text-foreground leading-[28px]">
          Team Members
        </h1>
        <p className="font-sans text-xs sm:text-sm text-muted-foreground mt-1">
          View active teammates, their commitment completion rates, and manage roles or access.
        </p>
      </div>
      <MembersSettingsTable />
    </div>
  );
}
