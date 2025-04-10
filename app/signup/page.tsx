import { SignUpForm } from "@/components/auth/signup-form"
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function SignUpPage() {
  const supabase = await createSupabaseServerClient() // Await here
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // If user is already logged in, redirect to dashboard
  if (user) {
    redirect("/dashboard")
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex min-h-screen flex-col items-center justify-center">
        <Link href="/" className="absolute left-4 top-4 md:left-8 md:top-8 flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
          >
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
          <span className="font-medium">Back</span>
        </Link>
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          <div className="flex flex-col space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
            <p className="text-sm text-muted-foreground">Enter your email and password to create your account</p>
          </div>
          <SignUpForm />
          <p className="px-8 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="underline underline-offset-4 hover:text-primary">
              Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}