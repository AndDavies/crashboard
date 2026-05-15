import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { MarketingPageFrame } from "@/components/marketing/page-frame";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

  return (
    <MarketingPageFrame className="flex min-h-[min(70vh,40rem)] flex-col justify-center py-16 md:py-24">
      <Card className="mx-auto w-full max-w-md shadow-sm">
        <CardHeader className="text-center sm:text-left">
          <CardTitle className="font-heading text-2xl">Sign in</CardTitle>
          <CardDescription>
            Use the email and password for your Supabase user. You’ll stay signed
            in until you sign out.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error === "auth" ? (
            <p
              role="alert"
              className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-center text-sm text-foreground"
            >
              Something went wrong confirming your session. Try again.
            </p>
          ) : null}
          {error === "whoop_session" ? (
            <p
              role="alert"
              className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-center text-sm text-foreground"
            >
              Sign in to finish linking WHOOP, then open the Whoop dashboard and
              choose <strong className="font-medium">Connect WHOOP</strong>{" "}
              again.
            </p>
          ) : null}
          <LoginForm nextPath={nextPath} />
        </CardContent>
      </Card>
    </MarketingPageFrame>
  );
}
