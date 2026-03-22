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
import { getPublicSiteOrigin, getXOAuthCallbackUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "X OAuth setup",
  description: "Callback URL for X developer portal (xurl).",
};

export default function XOAuthStartPage() {
  const origin = getPublicSiteOrigin();
  const callbackUrl = getXOAuthCallbackUrl();

  return (
    <MarketingPageFrame className="flex min-h-[min(70vh,40rem)] flex-col justify-center py-16 md:py-24">
      <Card className="mx-auto w-full max-w-lg shadow-sm">
        <CardHeader className="text-center sm:text-left">
          <CardTitle className="font-heading text-2xl">X app OAuth (xurl)</CardTitle>
          <CardDescription>
            Use the callback URL below in the X developer portal. This project does not exchange
            tokens on this page yet — it only confirms redirects and logs query params server-side.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <p className="text-sm font-medium">Callback URL to register</p>
            <p className="break-all rounded-md border border-border bg-muted/40 p-3 font-mono text-sm">
              {callbackUrl}
            </p>
          </div>

          <div className="space-y-1 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Resolved site origin</span> (from{" "}
              <code className="rounded bg-muted px-1 font-mono text-xs">
                NEXT_PUBLIC_SITE_URL
              </code>{" "}
              or Vercel / localhost):{" "}
              <code className="rounded bg-muted px-1 font-mono text-xs">{origin}</code>
            </p>
          </div>

          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            <li>
              Test the callback:{" "}
              <Link
                href="/auth/x/callback?code=test123&state=abc"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                /auth/x/callback?code=test123&amp;state=abc
              </Link>
            </li>
            <li>Server logs include raw query keys and values (check your host logs).</li>
            <li>Never put client secrets in the URL; the debug page redacts common secret keys.</li>
          </ul>

          <p className="text-center text-sm text-muted-foreground">
            <Link
              href="/login"
              className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Sign in
            </Link>
            {" · "}
            <Link
              href="/"
              className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Home
            </Link>
          </p>
        </CardContent>
      </Card>
    </MarketingPageFrame>
  );
}
