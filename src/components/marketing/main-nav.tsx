"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/components/marketing/mobile-nav";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MainNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
      {items.map(({ href, label }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative px-3 py-2 text-sm font-medium tracking-tight outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            <span
              className={cn(
                "absolute inset-x-3 -bottom-px h-0.5 origin-left bg-accent transition-transform duration-200",
                active
                  ? "scale-x-100"
                  : "scale-x-0 group-hover:scale-x-100",
              )}
              aria-hidden
            />
          </Link>
        );
      })}
    </nav>
  );
}
