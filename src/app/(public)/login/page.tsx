import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPageFrame } from "@/components/marketing/page-frame";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoginForm } from "./login-form";
import { dashboardUsesGoogleAuth } from "@/lib/dashboard-auth/session";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Crashboard dashboard.",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const { next, error } = await searchParams;
  const nextPath = next?.startsWith("/") ? next : "/dashboard";
  const googleAuth = dashboardUsesGoogleAuth();

  return (
    <MarketingPageFrame className="flex min-h-[min(70vh,40rem)] flex-col justify-center py-16 md:py-24">
      <Card className="mx-auto w-full max-w-md">
        <CardHeader className="text-center sm:text-left">
          <p className="eyebrow">Dashboard access</p>
          <h1 className="font-heading text-3xl font-semibold">
            Sign in
          </h1>
          <CardDescription>
            {googleAuth
              ? "Use your approved Google account. Login does not depend on the Intelligence database."
              : "Use the email and password for your existing dashboard account."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error === "auth" ? (
            <p
              role="alert"
              className="border border-border bg-muted/50 px-3 py-2 text-center text-sm text-foreground"
            >
              Something went wrong confirming your session. Try again.
            </p>
          ) : null}
          {error === "whoop_session" ? (
            <p
              role="alert"
              className="border border-border bg-muted/50 px-3 py-2 text-center text-sm text-foreground"
            >
              Sign in to finish linking WHOOP, then open the Whoop dashboard and
              choose <strong className="font-medium">Connect WHOOP</strong>{" "}
              again.
            </p>
          ) : null}
          {error === "account" ? (
            <p role="alert" className="border border-border bg-muted/50 px-3 py-2 text-center text-sm text-foreground">
              That Google account is not approved for this dashboard.
            </p>
          ) : null}
          {error === "config" || error === "state" ? (
            <p role="alert" className="border border-border bg-muted/50 px-3 py-2 text-center text-sm text-foreground">
              Sign-in could not start safely. Try again; if it persists, check the Google callback and session secret.
            </p>
          ) : null}
          {googleAuth ? (
            <>
              <Button
                nativeButton={false}
                render={<Link href={`/api/auth/google/start?next=${encodeURIComponent(nextPath)}`} />}
                className="w-full"
                size="lg"
              >
                Continue with Google
              </Button>
              <p className="text-center text-xs text-muted-foreground">Approved account: m.andrew.davies@gmail.com</p>
            </>
          ) : <LoginForm nextPath={nextPath} />}
        </CardContent>
      </Card>
    </MarketingPageFrame>
  );
}
