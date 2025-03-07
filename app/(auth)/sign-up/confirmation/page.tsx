import Link from "next/link"
import { CheckCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

export default function SignUpConfirmationPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="mx-auto max-w-sm">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Check your email</CardTitle>
          <CardDescription>
            We've sent you a confirmation email. Please check your inbox to verify your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-muted-foreground">
          <p>If you don't see the email, check your spam folder or try again.</p>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button asChild className="w-full">
            <Link href="/sign-in">Return to sign in</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

