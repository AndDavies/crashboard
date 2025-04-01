import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

export default function CommunicationSettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Communication Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Contact Information</CardTitle>
          <CardDescription>Manage your email and phone number for communications.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" type="email" placeholder="john@example.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input id="phone" type="tel" placeholder="+27 71 234 5678" />
            </div>
            <Button type="submit">Update Contact Info</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

