"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import type React from "react"
import { supabase } from "@/lib/supabase"
import { DashboardSidebar } from "@/components/dashboard-sidebar"
import { Header } from "@/components/header"
import { SidebarInset } from "@/components/ui/sidebar"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    let mounted = true

    async function checkAuth() {
      try {
        console.log("Dashboard layout: Checking auth...")
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!mounted) return

        if (!session) {
          console.log("Dashboard layout: No session found, redirecting to sign-in")
          router.push("/sign-in")
        } else {
          console.log("Dashboard layout: Session found, user is authenticated")
          setIsAuthenticated(true)
          setIsLoading(false)
        }
      } catch (error) {
        console.error("Dashboard layout: Error checking authentication:", error)
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    checkAuth()

    // Set a timeout to prevent getting stuck in loading state
    const timer = setTimeout(() => {
      if (mounted) {
        console.log("Dashboard layout: Loading timeout reached, showing content anyway")
        setIsLoading(false)
      }
    }, 2000)

    return () => {
      mounted = false
      clearTimeout(timer)
    }
  }, [router])

  // If still loading, show a loading indicator
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-lg">Loading dashboard...</p>
      </div>
    )
  }

  // Even if not authenticated, we'll render the content
  // The middleware or client-side redirect will handle unauthorized access
  return (
    <div className="flex min-h-screen">
      <DashboardSidebar />
      <SidebarInset>
        <div className="flex flex-col min-h-screen">
          <Header />
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </SidebarInset>
    </div>
  )
}

