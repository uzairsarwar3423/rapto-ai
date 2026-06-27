"use client";

import React from 'react';
import { useTeamMembers } from '../hooks/useTeamMembers';
import { MemberTable } from './MemberTable/MemberTable';
import { MemberTableSkeleton } from './MemberTable/MemberTableSkeleton';
import { useAuthStore } from '@/features/auth/store/auth.store';

export function MembersSettingsTable() {
  const { data: members, isPending } = useTeamMembers();
  const user = useAuthStore((state) => state.user);

  if (isPending) {
    return <MemberTableSkeleton />;
  }

  return (
    <div className="space-y-4">
      <MemberTable members={members || []} requester={user} />
    </div>
  );
}
