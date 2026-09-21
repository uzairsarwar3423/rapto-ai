// web/src/features/team/components/InviteMemberSheet.tsx

"use client";

import React from "react";
import { InviteMemberModal, type InviteMemberModalProps } from "./InviteMemberModal";

export type InviteMemberSheetProps = InviteMemberModalProps;

/**
 * InviteMemberSheet - Backwards-compatible wrapper that renders the responsive
 * InviteMemberModal (Dialog on desktop, Bottom Sheet Drawer on mobile).
 */
export function InviteMemberSheet(props: InviteMemberSheetProps) {
  return <InviteMemberModal {...props} />;
}

export { InviteMemberModal };
