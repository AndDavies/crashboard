"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "./sidebar-provider";
import { cn } from "@/lib/utils";
import { LayoutDashboard, BarChart3, ChevronsLeftRightEllipsis, Settings, HelpCircle, LogOut, Menu, User, FileText, HandHelping, Bookmark, Rss, Sparkles } from 'lucide-react';
import { Button } from "@/components/ui/button";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function Sidebar({ user }: { user: SupabaseUser }) {
  const pathname = usePathname();
  const { isOpen, toggle } = useSidebar();
  const router = useRouter();

  const handleSignOut = async () => {
    const response = await fetch("/auth/signout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      router.push("/login");
      router.refresh();
    }
  };

  return (
    <>
      <div
        className={cn("fixed inset-0 z-50 bg-background/80 backdrop-blur-sm lg:hidden", isOpen ? "block" : "hidden")}
        onClick={toggle}
      />
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 bg-background",
          "transition-transform duration-300 ease-in-out",
          "border-r",
          isOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0",
        )}
      >
        <div className="flex h-14 items-center border-b px-4">
          <span className="text-lg font-semibold">Personal Dashboard</span>
          <Button variant="ghost" size="icon" className="ml-auto lg:hidden" onClick={toggle}>
            <Menu className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex flex-col h-[calc(100vh-3.5rem)]">
          <div className="flex-1 overflow-auto py-2">
            <nav className="grid gap-1 px-2">
              {navItems.map((item, index) => (
                <TooltipProvider key={index}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground relative",
                          pathname === item.href ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                        )}
                      >
                        <item.icon className="h-5 w-5" />
                        <span>{item.name}</span>
                        {item.isNew && (
                          <Badge variant="secondary" className="ml-auto bg-purple-500/10 text-purple-500 hover:bg-purple-500/20">
                            <Sparkles className="h-3 w-3 mr-1" />
                            New
                          </Badge>
                        )}
                      </Link>
                    </TooltipTrigger>
                    {item.tooltip && (
                      <TooltipContent side="right" align="center">
                        <p className="text-sm">{item.tooltip}</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              ))}
            </nav>
          </div>
          <div className="border-t p-2">
            <nav className="grid gap-1">
              <Link
                href="/dashboard/settings"
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
                  pathname === "/dashboard/settings" ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                )}
              >
                <Settings className="h-5 w-5" />
                <span>Settings</span>
              </Link>
              <Link
                href="/dashboard/help"
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
                  pathname === "/dashboard/help" ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                )}
              >
                <HelpCircle className="h-5 w-5" />
                <span>Help</span>
              </Link>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground w-full text-left"
              >
                <LogOut className="h-5 w-5" />
                <span>Logout</span>
              </button>
            </nav>
          </div>
        </div>
      </div>
    </>
  );
}

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Blog CMS", href: "/dashboard/blog", icon: User },
  { 
    name: "Reminders", 
    href: "/dashboard/reminders", 
    icon: HandHelping,
    isNew: true,
    tooltip: "Reminders"
  },
  { 
    name: "Cursor Aid", 
    href: "/dashboard/cursor", 
    icon: ChevronsLeftRightEllipsis,
    isNew: true,
    tooltip: "Cursor Prompt Refiner"
  },
  { 
    name: "Prompts", 
    href: "/dashboard/prompts", 
    icon: FileText,
    isNew: true,
    //tooltip: "New! Now with number and word seeds for better prompt generation"
  },
  { name: "Bookmarks", href: "/dashboard/bookmarks", icon: Bookmark },
];