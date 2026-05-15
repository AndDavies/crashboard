import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bot,
  Briefcase,
  FileEdit,
  FileText,
  FlaskConical,
  FolderKanban,
  HeartPulse,
  LayoutDashboard,
  LibraryBig,
  Moon,
  Send,
  Settings,
  StickyNote,
  Users,
  Workflow,
  Wrench,
  Zap,
} from "lucide-react";

/** Single navigable route in the dashboard. */
export type DashboardNavLeaf = {
  title: string;
  href: string;
  icon: LucideIcon;
};

/** Grouped section with optional default-open collapsible. */
export type DashboardNavGroup = {
  id: string;
  title: string;
  icon: LucideIcon;
  /** When false, group is rendered as a non-link label row only. */
  defaultOpen?: boolean;
  items: DashboardNavLeaf[];
};

/**
 * Sidebar information architecture.
 * Add groups or leaves here — rendering is driven by this config.
 */
export const dashboardNavGroups: DashboardNavGroup[] = [
  {
    id: "overview",
    title: "Overview",
    icon: LayoutDashboard,
    defaultOpen: true,
    items: [
      {
        title: "Overview",
        href: "/dashboard",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    id: "whoop",
    title: "Whoop",
    icon: Activity,
    defaultOpen: true,
    items: [
      { title: "Whoop dashboard", href: "/dashboard/whoop", icon: Activity },
      { title: "Recovery", href: "/dashboard/whoop/recovery", icon: HeartPulse },
      { title: "Sleep", href: "/dashboard/whoop/sleep", icon: Moon },
      { title: "Strain", href: "/dashboard/whoop/strain", icon: Zap },
    ],
  },
  {
    id: "openclaw",
    title: "OpenClaw",
    icon: Bot,
    defaultOpen: true,
    items: [
      {
        title: "Agents",
        href: "/dashboard/openclaw/agents",
        icon: Users,
      },
      {
        title: "Projects",
        href: "/dashboard/openclaw/projects",
        icon: FolderKanban,
      },
    ],
  },
  {
    id: "knowledgebase",
    title: "Knowledgebase",
    icon: LibraryBig,
    defaultOpen: true,
    items: [
      {
        title: "Repository",
        href: "/dashboard/knowledgebase",
        icon: LibraryBig,
      },
    ],
  },
  {
    id: "projects",
    title: "Projects",
    icon: FolderKanban,
    defaultOpen: true,
    items: [
      {
        title: "Crashboard",
        href: "/dashboard/projects/crashboard",
        icon: FolderKanban,
      },
      {
        title: "Other projects",
        href: "/dashboard/projects/other",
        icon: Briefcase,
      },
    ],
  },
  {
    id: "tools",
    title: "Scripts & tools",
    icon: Wrench,
    defaultOpen: false,
    items: [
      {
        title: "Automations",
        href: "/dashboard/tools/automations",
        icon: Workflow,
      },
      {
        title: "Utilities",
        href: "/dashboard/tools/utilities",
        icon: Wrench,
      },
      {
        title: "Experiments",
        href: "/dashboard/tools/experiments",
        icon: FlaskConical,
      },
    ],
  },
  {
    id: "content",
    title: "Content",
    icon: FileText,
    defaultOpen: false,
    items: [
      { title: "Notes", href: "/dashboard/content/notes", icon: StickyNote },
      { title: "Blog", href: "/dashboard/content/blog", icon: FileText },
      { title: "Drafts", href: "/dashboard/content/drafts", icon: FileEdit },
      {
        title: "Publishing",
        href: "/dashboard/content/publishing",
        icon: Send,
      },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    icon: Settings,
    defaultOpen: true,
    items: [
      { title: "Preferences", href: "/dashboard/settings", icon: Settings },
    ],
  },
];

/** Flat list of every leaf (for collapsed icon rail + mobile full nav). */
export function flattenDashboardNav(): DashboardNavLeaf[] {
  return dashboardNavGroups.flatMap((g) => g.items);
}

export function findNavTitleForPath(pathname: string): string | null {
  for (const group of dashboardNavGroups) {
    for (const item of group.items) {
      if (item.href === pathname) return item.title;
    }
  }
  return null;
}

export type BreadcrumbItem = { label: string; href: string };

/** Builds /dashboard → … crumbs using nav labels where possible. */
export function getDashboardBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "dashboard") {
    return [{ label: "Dashboard", href: "/dashboard" }];
  }
  const crumbs: BreadcrumbItem[] = [{ label: "Dashboard", href: "/dashboard" }];
  let acc = "/dashboard";
  for (let i = 1; i < parts.length; i++) {
    acc += `/${parts[i]}`;
    const label =
      findNavTitleForPath(acc) ??
      parts[i]!.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    crumbs.push({ label, href: acc });
  }
  return crumbs;
}
