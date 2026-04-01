"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  dashboardNavGroups,
  type DashboardNavGroup,
  type DashboardNavLeaf,
} from "@/lib/dashboard/nav-config";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronDownIcon, ExternalLinkIcon } from "lucide-react";

function pathIsActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
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
    "flex items-center gap-2.5 rounded-lg text-sm font-medium outline-none transition-colors",
    collapsed ? "size-9 justify-center px-0" : "px-2.5 py-2",
    active
      ? "bg-muted text-foreground"
      : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
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

function GroupBlock({
  group,
  pathname,
  collapsed,
  onNavigate,
}: {
  group: DashboardNavGroup;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1 py-1">
        {group.items.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            pathname={pathname}
            collapsed
            onNavigate={onNavigate}
          />
        ))}
      </div>
    );
  }

  const openDefault = group.defaultOpen !== false;

  return (
    <Collapsible defaultOpen={openDefault} className="group/collapsible">
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase outline-none transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring group-data-open/collapsible:text-foreground">
        <group.icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{group.title}</span>
        <ChevronDownIcon className="size-3.5 shrink-0 opacity-50 transition-transform duration-200 group-data-open/collapsible:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-0.5 space-y-0.5 pl-1 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0">
        {group.items.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            pathname={pathname}
            collapsed={false}
            onNavigate={onNavigate}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
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

  return (
    <TooltipProvider delay={300}>
      <div
        className={cn(
          "flex h-full flex-col border-border/80 bg-sidebar text-sidebar-foreground",
          className,
        )}
      >
        <div className="flex h-14 shrink-0 items-center border-b border-border/80 px-3">
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    href="/dashboard"
                    onClick={onNavigate}
                    className="mx-auto flex size-9 items-center justify-center rounded-lg font-heading text-sm font-bold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              className="font-heading text-sm font-semibold tracking-tight text-foreground outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring"
            >
              Crashboard
            </Link>
          )}
        </div>

        <ScrollArea className="flex-1 px-2 py-3">
          <nav className="flex flex-col gap-3" aria-label="Dashboard">
            {dashboardNavGroups.map((group, index) => (
              <div key={group.id}>
                {index > 0 ? (
                  <Separator className="mb-3 bg-border/60" />
                ) : null}
                <GroupBlock
                  group={group}
                  pathname={pathname}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              </div>
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
