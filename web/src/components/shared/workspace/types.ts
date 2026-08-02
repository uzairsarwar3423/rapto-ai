export type WorkspacePlan =
  | "Free"
  | "Pro"
  | "Enterprise"
  | "Trial"
  | "Starter"
  | "Business"
  | (string & {});

export type WorkspaceRole = "Owner" | "Admin" | "Member";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  avatarGradient?: string;
  plan: WorkspacePlan;
  role: WorkspaceRole;
  membersCount: number;
  isPersonal?: boolean;
  active?: boolean;
  shortcut?: string;
}
