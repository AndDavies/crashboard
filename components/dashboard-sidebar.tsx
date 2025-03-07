"use client"

import {
  BarChart3,
  Code2,
  Database,
  FileCode,
  Home,
  LayoutDashboard,
  Settings,
  BugIcon as Spider,
  Terminal,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

export function DashboardSidebar() {
  const pathname = usePathname()

  const mainNavItems = [
    {
      title: "Dashboard",
      href: "/",
      icon: Home,
    },
    {
      title: "Scrapers",
      href: "/scrapers",
      icon: Spider,
    },
    {
      title: "Scripts",
      href: "/scripts",
      icon: Terminal,
    },
    {
      title: "Analytics",
      href: "/analytics",
      icon: BarChart3,
    },
  ]

  const toolsNavItems = [
    {
      title: "API",
      href: "/api",
      icon: Code2,
    },
    {
      title: "Database",
      href: "/database",
      icon: Database,
    },
    {
      title: "Files",
      href: "/files",
      icon: FileCode,
    },
  ]

  return (
    <Sidebar variant="inset">
      <SidebarHeader className="flex flex-col gap-2 p-4">
        <div className="flex items-center gap-2 px-2">
          <LayoutDashboard className="h-6 w-6" />
          <span className="text-lg font-semibold">DevDash</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={item.title}>
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {toolsNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={item.title}>
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Settings">
              <Link href="/settings">
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

