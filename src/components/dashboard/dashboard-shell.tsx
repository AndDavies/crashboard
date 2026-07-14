"use client";

import { useCallback, useSyncExternalStore, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftIcon, MenuIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SignOutButton } from "@/components/sign-out-button";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { DashboardBreadcrumbs } from "@/components/dashboard/dashboard-breadcrumbs";
import { findNavTitleForPath } from "@/lib/dashboard/nav-config";

const STORAGE_KEY = "crashboard-dashboard-sidebar-collapsed";
const STORAGE_CHANGE_EVENT = `crashboard-local-storage:${STORAGE_KEY}`;

function usePersistedSidebarCollapsed() {
  const subscribe = useCallback((onStoreChange: () => void) => {
    if (typeof window === "undefined") return () => {};
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) onStoreChange();
    };
    const onLocal = () => onStoreChange();
    window.addEventListener("storage", onStorage);
    window.addEventListener(STORAGE_CHANGE_EVENT, onLocal);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(STORAGE_CHANGE_EVENT, onLocal);
    };
  }, []);

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }, []);

  const getServerSnapshot = useCallback(() => false, []);

  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setCollapsed = useCallback(
    (action: React.SetStateAction<boolean>) => {
      if (typeof window === "undefined") return;
      const prev = getSnapshot();
      const next = typeof action === "function" ? action(prev) : action;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));
    },
    [getSnapshot],
  );

  return [collapsed, setCollapsed] as const;
}

type Props = {
  children: React.ReactNode;
  userEmail: string | null;
  authMode: "google" | "supabase";
};

export function DashboardShell({ children, userEmail, authMode }: Props) {
  const pathname = usePathname() ?? "/dashboard";
  const [collapsed, setCollapsed] = usePersistedSidebarCollapsed();
  const [mobileOpen, setMobileOpen] = useState(false);

  const pageTitle = findNavTitleForPath(pathname) ?? "Dashboard";

  return (
    <div className="flex min-h-full bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-svh shrink-0 border-r border-foreground/80 transition-[width] duration-200 ease-out md:block",
          collapsed ? "w-17" : "w-56",
        )}
        aria-label="Dashboard navigation"
      >
        <DashboardSidebar collapsed={collapsed} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-foreground/80 bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/80 md:px-5">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="Open navigation menu"
                >
                  <MenuIcon className="size-5" aria-hidden />
                </Button>
              }
            />
            <SheetContent side="left" className="w-[min(100%,18rem)] p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Dashboard navigation</SheetTitle>
              </SheetHeader>
              <DashboardSidebar
                collapsed={false}
                onNavigate={() => setMobileOpen(false)}
                className="h-full border-0"
              />
            </SheetContent>
          </Sheet>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hidden size-9 md:flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={collapsed}
            onClick={() => setCollapsed((c) => !c)}
          >
            <PanelLeftIcon
              className={cn(
                "size-5 text-muted-foreground transition-transform duration-200",
                collapsed && "text-foreground",
              )}
              aria-hidden
            />
          </Button>

          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <DashboardBreadcrumbs />
            <h1 className="truncate font-heading text-base font-semibold tracking-tight text-foreground md:text-lg">
              {pageTitle}
            </h1>
          </div>

          <div className="hidden shrink-0 items-center gap-3 sm:flex">
            {userEmail ? (
              <span className="max-w-48 truncate text-xs text-muted-foreground">
                {userEmail}
              </span>
            ) : null}
            <SignOutButton authMode={authMode} />
          </div>

          <div className="flex shrink-0 sm:hidden">
            <SignOutButton authMode={authMode} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[90rem] flex-1 px-4 py-6 md:px-6 md:py-8 lg:px-8">
          {children}
        </main>

        <footer className="mt-auto border-t border-border/80 py-3 text-center text-[11px] text-muted-foreground">
          <Link
            href="/"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            ← Public site
          </Link>
        </footer>
      </div>
    </div>
  );
}
