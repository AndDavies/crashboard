"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartNoAxesCombined,
  LayoutDashboard,
  LibraryBig,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type IntelligenceDestination = {
  href: string;
  label: string;
  compactLabel: string;
  icon: LucideIcon;
  active: (pathname: string) => boolean;
};

const DESTINATIONS: IntelligenceDestination[] = [
  {
    href: "/intelligence",
    label: "Overview",
    compactLabel: "Overview",
    icon: LayoutDashboard,
    active: (pathname) => pathname === "/intelligence",
  },
  {
    href: "/intelligence/explore",
    label: "Explore trends",
    compactLabel: "Explore",
    icon: ChartNoAxesCombined,
    active: (pathname) => pathname.startsWith("/intelligence/explore") || pathname.startsWith("/intelligence/trends/"),
  },
  {
    href: "/intelligence/articles",
    label: "Browse sources",
    compactLabel: "Sources",
    icon: LibraryBig,
    active: (pathname) => pathname.startsWith("/intelligence/articles"),
  },
];

export function IntelligenceSectionNav() {
  const pathname = usePathname();

  return (
    <nav
      className="sticky top-16 z-30 mb-9 grid grid-cols-3 border border-border/90 bg-background/95 shadow-[0_1px_0_color-mix(in_oklch,var(--foreground)_7%,transparent)] backdrop-blur-md md:top-24"
      aria-label="Intelligence sections"
    >
      {DESTINATIONS.map((destination, index) => {
        const current = destination.active(pathname);
        const Icon = destination.icon;
        return (
          <Link
            key={destination.href}
            href={destination.href}
            aria-current={current ? "page" : undefined}
            aria-label={destination.label}
            className={cn(
              "group relative flex min-h-11 items-center justify-center gap-2 px-2 text-xs font-semibold outline-none motion-safe:transition-colors sm:px-4 sm:text-sm",
              index > 0 && "border-l border-border/90",
              current
                ? "bg-card text-foreground"
                : "bg-background/70 text-muted-foreground hover:bg-card/80 hover:text-foreground focus-visible:bg-card/80",
              "focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
            )}
          >
            <Icon className={cn("size-4 shrink-0 motion-safe:transition-colors", current ? "text-accent" : "text-muted-foreground group-hover:text-accent")} aria-hidden />
            <span className="sm:hidden">{destination.compactLabel}</span>
            <span className="hidden sm:inline">{destination.label}</span>
            <span
              className={cn(
                "absolute inset-x-0 bottom-0 h-0.5 origin-left bg-accent motion-safe:transition-transform motion-safe:duration-200",
                current ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100 group-focus-visible:scale-x-100",
              )}
              aria-hidden
            />
          </Link>
        );
      })}
    </nav>
  );
}
