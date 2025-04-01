import type React from "react"
import { Sidebar } from "@/components/sidebar"
import { Header } from "@/components/header"
import { SidebarProvider } from "@/components/sidebar-provider"
import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient() // Await here
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // If user is not logged in, redirect to login page
  if (!user) {
    redirect("/login")
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-background">
        <Sidebar user={user} />
        <div className="lg:pl-72">
          <Header user={user} />
          <main className="p-4 md:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  )
}