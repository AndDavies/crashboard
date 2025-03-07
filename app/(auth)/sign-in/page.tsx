"use client"

import type React from "react"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { LayoutDashboard } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { supabase } from "@/lib/supabase"

export default function SignInPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)

  // Check if user is already logged in
  useEffect(() => {
    const checkSession = async () => {
      try {
        console.log("Sign-in page: Checking for existing session...")
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (session) {
          console.log("Sign-in page: User already has a session")
          // Instead of redirecting immediately, set a flag
          setCheckingSession(false)
        } else {
          console.log("Sign-in page: No session found")
          setCheckingSession(false)
        }
      } catch (error) {
        console.error("Sign-in page: Error checking session:", error)
        setCheckingSession(false)
      }
    }

    checkSession()
  }, [router])

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      console.log("Sign-in page: Attempting to sign in with email:", email)
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        throw error
      }

      console.log("Sign-in page: Sign in successful")

      // Use a hard redirect to the dashboard
      window.location.href = "/"
    } catch (error: any) {
      console.error("Sign-in page: Sign in error:", error)
      setError(error.message || "An error occurred during sign in")
      setLoading(false)
    }
  }

  // If still checking session, show loading
  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Checking authentication...</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="mx-auto max-w-sm">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
              <LayoutDashboard className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Sign In</CardTitle>
          <CardDescription>Enter your credentials to access your dashboard</CardDescription>
        </CardHeader>
        <form onSubmit={handleSignIn}>
          <CardContent className="space-y-4">
            {error && <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">{error}</div>}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link href="/forgot-password" className="text-sm text-primary underline-offset-4 hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
            <div className="text-center text-sm">
              Don&apos;t have an account?{" "}
              <Link href="/sign-up" className="text-primary underline-offset-4 hover:underline">
                Sign up
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}

