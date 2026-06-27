import {
  LayoutDashboard,
  Video,
  CheckCircle2,
  ListTodo,
  Users,
  BarChart3,
  Settings,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

export interface CommandItem {
  id: string;
  label: string;
  group: "Navigate" | "Actions";
  icon: LucideIcon;
  shortcut?: string[];
  synonyms?: string[];
  perform: (router: { push: (href: string) => void }) => void;
}

export const navigateCommands: CommandItem[] = [
  {
    id: "nav-dashboard",
    label: "Dashboard",
    group: "Navigate",
    icon: LayoutDashboard,
    perform: (r) => r.push("/dashboard"),
  },
  {
    id: "nav-meetings",
    label: "Meetings",
    group: "Navigate",
    icon: Video,
    perform: (r) => r.push("/meetings"),
  },
  {
    id: "nav-commitments",
    label: "Commitments",
    group: "Navigate",
    icon: CheckCircle2,
    perform: (r) => r.push("/commitments"),
  },
  {
    id: "nav-action-items",
    label: "Action Items",
    group: "Navigate",
    icon: ListTodo,
    perform: (r) => r.push("/action-items"),
  },
  {
    id: "nav-team",
    label: "Team",
    group: "Navigate",
    icon: Users,
    perform: (r) => r.push("/team"),
  },
  {
    id: "nav-analytics",
    label: "Analytics",
    group: "Navigate",
    icon: BarChart3,
    perform: (r) => r.push("/analytics"),
  },
  {
    id: "nav-settings",
    label: "Settings",
    group: "Navigate",
    icon: Settings,
    perform: (r) => r.push("/settings"),
  },
];

export const actionCommands: CommandItem[] = [
  {
    id: "action-new-meeting",
    label: "New meeting",
    group: "Actions",
    icon: Plus,
    shortcut: ["mod", "N"],
    perform: () => toast.info("Coming Day 32"),
  },
];
