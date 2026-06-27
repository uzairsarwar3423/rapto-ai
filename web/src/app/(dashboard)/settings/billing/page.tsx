import type { Metadata } from 'next';
import { SettingsPlaceholder } from '@/shared/components/layout/SettingsPlaceholder';

export const metadata: Metadata = {
  title: 'Billing Settings',
  description: 'Manage your organization plan, billing information, and invoices.',
};

export default function BillingSettingsPage() {
  return (
    <SettingsPlaceholder
      title="Billing"
      description="Manage organization plans, subscriptions, payment details, and check invoices."
      comingDay={42}
    />
  );
}
