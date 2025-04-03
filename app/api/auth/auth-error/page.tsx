import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function AuthErrorPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <div className="mx-auto flex w-full flex-col justify-center space-y-6 max-w-md px-4">
        <div className="flex flex-col space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Authentication Error</h1>
          <p className="text-sm text-muted-foreground">
            There was a problem with your authentication request. This could be due to an expired or invalid link.
          </p>
        </div>
        <div className="flex flex-col space-y-4">
          <Link href="/login">
            <Button className="w-full">Return to Login</Button>
          </Link>
          <Link href="/">
            <Button variant="outline" className="w-full">
              Go to Home Page
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

