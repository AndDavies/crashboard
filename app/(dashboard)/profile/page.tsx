"use client"

import { useState, useEffect } from "react"
import type { User } from "@supabase/supabase-js"
import { Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { supabase } from "@/lib/supabase"

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [fullName, setFullName] = useState("")
  const [bio, setBio] = useState("")
  const [website, setWebsite] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    async function getUser() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        setUser(user)

        // Fetch profile data from a profiles table if you have one
        // For now, we'll just use placeholder data
        setFullName("John Doe")
        setBio("Web developer and automation enthusiast")
        setWebsite("https://example.com")
      } catch (error) {
        console.error("Error fetching user:", error)
      } finally {
        setLoading(false)
      }
    }

    getUser()
  }, [])

  const handleUpdateProfile = async () => {
    setIsSaving(true)

    try {
      // Here you would update the user's profile in your database
      // For example:
      // await supabase.from('profiles').upsert({
      //   id: user?.id,
      //   full_name: fullName,
      //   bio,
      //   website
      // })

      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "There was an error updating your profile.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = "/sign-in"
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">Loading profile...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Profile</h2>
        <p className="text-muted-foreground">Manage your account settings and preferences</p>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="password">Password</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>General Information</CardTitle>
              <CardDescription>Update your personal information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={user?.email || ""} disabled />
                <p className="text-sm text-muted-foreground">
                  Your email address is used for sign in and notifications
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={4} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input id="website" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleUpdateProfile} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save changes"}
                {!isSaving && <Save className="ml-2 h-4 w-4" />}
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>Manage your account settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="space-y-1">
                <Label>Account Created</Label>
                <div>{user?.created_at ? new Date(user.created_at).toLocaleDateString() : "Unknown"}</div>
              </div>
              <div className="space-y-1">
                <Label>Last Sign In</Label>
                <div>{user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString() : "Unknown"}</div>
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="text-destructive" onClick={handleSignOut}>
                Sign out
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="password" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Password</CardTitle>
              <CardDescription>Change your password</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">Current Password</Label>
                <Input id="current-password" type="password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input id="new-password" type="password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input id="confirm-password" type="password" />
              </div>
            </CardContent>
            <CardFooter>
              <Button>Change password</Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>Manage your notification preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Configure how you receive notifications about your tasks, scripts, and system updates.
              </p>
              <Separator />
              <div className="space-y-4">
                {/* Notification settings would go here */}
                <p className="text-sm">Notification settings coming soon</p>
              </div>
            </CardContent>
            <CardFooter>
              <Button>Save preferences</Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

