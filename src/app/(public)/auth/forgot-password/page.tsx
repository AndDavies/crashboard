import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPageFrame } from "@/components/marketing/page-frame";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Request a link to reset your Crashboard password.",
};

export default function ForgotPasswordPage() {
  return (
    <MarketingPageFrame className="flex min-h-[min(70vh,40rem)] flex-col justify-center py-16 md:py-24">
      <Card className="mx-auto w-full max-w-md shadow-sm">
        <CardHeader className="text-center sm:text-left">
          <CardTitle className="font-heading text-2xl">Reset password</CardTitle>
          <CardDescription>
            Enter the email on your account. We’ll send a secure link to set a
            new password.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ForgotPasswordForm />
          <p className="text-center text-sm text-muted-foreground">
            <Link
              href="/login"
              className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </MarketingPageFrame>
  );
}
