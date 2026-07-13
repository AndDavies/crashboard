"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  flattenDashboardNav,
  type DashboardNavLeaf,
} from "@/lib/dashboard/nav-config";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ExternalLinkIcon } from "lucide-react";

function pathIsActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/dashboard/intelligence") {
    return pathname === href || ["/documents/", "/events/", "/trends/"].some((part) => pathname.startsWith(`${href}${part}`));
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  pathname,
  collapsed,
  onNavigate,
}: {
  item: DashboardNavLeaf;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const active = pathIsActive(pathname, item.href);
  const Icon = item.icon;

  const className = cn(
    "flex items-center gap-2.5 text-sm font-medium outline-none transition-colors",
    collapsed ? "size-10 justify-center px-0" : "border-l-2 px-3 py-2.5",
    active
      ? collapsed
        ? "bg-accent/10 text-accent"
        : "border-accent bg-accent/10 font-semibold text-accent"
      : collapsed
        ? "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
        : "border-transparent text-muted-foreground hover:border-border/80 hover:bg-muted/60 hover:text-foreground",
    "focus-visible:ring-2 focus-visible:ring-ring",
  );

  const link = (
    <Link
      href={item.href}
      className={className}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
      {!collapsed ? <span className="truncate">{item.title}</span> : null}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex">
              <Link
                href={item.href}
                className={className}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
              </Link>
            </span>
          }
        />
        <TooltipContent side="right" sideOffset={6}>
          {item.title}
        </TooltipContent>
      </Tooltip>
    );
  }

  return link;
}

export function DashboardSidebar({
  collapsed,
  onNavigate,
  className,
}: {
  collapsed: boolean;
  /** Close mobile sheet after navigation */
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname() ?? "/dashboard";
  const items = flattenDashboardNav();

  return (
    <TooltipProvider delay={300}>
      <div
        className={cn(
          "flex h-full flex-col border-border/80 bg-sidebar text-sidebar-foreground",
          className,
        )}
      >
        <div className="flex h-16 shrink-0 items-center border-b border-foreground/80 px-3">
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    href="/dashboard"
                    onClick={onNavigate}
                    className="mx-auto flex size-10 items-center justify-center font-heading text-lg font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Crashboard — dashboard home"
                  />
                }
              >
                C
              </TooltipTrigger>
              <TooltipContent side="right">Crashboard</TooltipContent>
            </Tooltip>
          ) : (
            <Link
              href="/dashboard"
              onClick={onNavigate}
              className="outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="block font-heading text-xl font-semibold text-foreground">Crashboard</span>
              <span className="editorial-kicker mt-0.5 block">Content desk</span>
            </Link>
          )}
        </div>

        <ScrollArea className="flex-1 px-2 py-4">
          {!collapsed ? <p className="eyebrow px-3 pb-3">Workspace</p> : null}
          <nav className="flex flex-col gap-1" aria-label="Dashboard">
            {items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                pathname={pathname}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            ))}
          </nav>
        </ScrollArea>

        <div
          className={cn(
            "shrink-0 border-t border-border/80 p-2",
            collapsed ? "flex flex-col items-center gap-1" : "space-y-1",
          )}
        >
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9 text-muted-foreground"
                    nativeButton={false}
                    render={
                      <Link
                        href="/"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Open public site"
                      />
                    }
                  />
                }
              >
                <ExternalLinkIcon className="size-4" />
              </TooltipTrigger>
              <TooltipContent side="right">Public site</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-muted-foreground"
              nativeButton={false}
              render={
                <Link href="/" target="_blank" rel="noopener noreferrer" />
              }
            >
              <ExternalLinkIcon className="size-4" />
              Public site
            </Button>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
