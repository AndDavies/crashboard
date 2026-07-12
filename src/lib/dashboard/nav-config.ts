import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Database,
  FileText,
  LineChart,
  Search,
  Shield,
  Wrench,
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
    id: "intelligence",
    title: "Intelligence",
    icon: Activity,
    defaultOpen: true,
    items: [
      { title: "What's changing", href: "/dashboard/intelligence", icon: Activity },
      { title: "All trends", href: "/dashboard/intelligence/trends", icon: LineChart },
      { title: "Search evidence", href: "/dashboard/intelligence/explorer", icon: Search },
      { title: "Defence", href: "/dashboard/intelligence/defence", icon: Shield },
      { title: "Operations", href: "/dashboard/intelligence/operations", icon: Database },
    ],
  },
  {
    id: "content",
    title: "Blog CMS",
    icon: FileText,
    defaultOpen: true,
    items: [
      { title: "Blog", href: "/dashboard/content/blog", icon: FileText },
    ],
  },
  {
    id: "tools",
    title: "Tools",
    icon: Wrench,
    defaultOpen: true,
    items: [
      {
        title: "PDF Extractor",
        href: "/dashboard/tools/pdf-extractor",
        icon: FileText,
      },
    ],
  },
];

/** Flat list of every leaf (for collapsed icon rail + mobile full nav). */
export function flattenDashboardNav(): DashboardNavLeaf[] {
  return dashboardNavGroups.flatMap((g) => g.items);
}

export function findNavTitleForPath(pathname: string): string | null {
  return (
    flattenDashboardNav()
      .filter(
        (item) => item.href === pathname || pathname.startsWith(`${item.href}/`),
      )
      .sort((a, b) => b.href.length - a.href.length)[0]?.title ?? null
  );
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
    const exact = flattenDashboardNav().find((item) => item.href === acc);
    const label = exact?.title ??
      parts[i]!.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    crumbs.push({ label, href: acc });
  }
  return crumbs;
}
