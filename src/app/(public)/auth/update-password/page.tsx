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
import { UpdatePasswordForm } from "./update-password-form";

export const metadata: Metadata = {
  title: "New password",
  description: "Set a new password for your Crashboard account.",
  robots: { index: false, follow: false },
};

export default function UpdatePasswordPage() {
  return (
    <MarketingPageFrame className="flex min-h-[min(70vh,40rem)] flex-col justify-center py-16 md:py-24">
      <Card className="mx-auto w-full max-w-md">
        <CardHeader className="text-center sm:text-left">
          <CardTitle className="font-heading text-2xl">Choose a new password</CardTitle>
          <CardDescription>
            After you save, you’ll go to your dashboard. Use a strong password
            you haven’t used elsewhere.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <UpdatePasswordForm />
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
