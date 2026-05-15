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
import {
  buildSafeCallbackParamRows,
  flattenSearchParams,
} from "@/lib/oauth/safe-callback-display";
import { getXOAuthCallbackUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "X OAuth callback",
  description: "X (Twitter) OAuth redirect landing for xurl setup.",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function XOAuthCallbackPage({ searchParams }: Props) {
  const params = await searchParams;
  const flat = flattenSearchParams(params);

  console.info("[auth/x/callback] query params:", flat);

  const rows = buildSafeCallbackParamRows(params);
  const hasOAuthError = typeof params.error === "string" && params.error.length > 0;
  const hasCode = typeof params.code === "string" && params.code.length > 0;
  const ok = hasCode && !hasOAuthError;

  return (
    <MarketingPageFrame className="flex min-h-[min(70vh,40rem)] flex-col justify-center py-16 md:py-24">
      <Card className="mx-auto w-full max-w-lg shadow-sm">
        <CardHeader className="text-center sm:text-left">
          <CardTitle className="font-heading text-2xl">
            {ok ? "Callback reached" : hasOAuthError ? "OAuth error" : "Callback reached"}
          </CardTitle>
          <CardDescription>
            X redirected here successfully. This page is for setup and debugging only — no
            token exchange runs yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Register{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              {getXOAuthCallbackUrl()}
            </code>{" "}
            as the callback URL in the X developer portal.
          </p>

          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No query parameters. Try{" "}
              <Link
                href="/auth/x/start"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                /auth/x/start
              </Link>{" "}
              for setup notes.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium">Query parameters (sanitized)</p>
              <dl className="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
                {rows.map((row) => (
                  <div key={row.key} className="grid gap-1 sm:grid-cols-[8rem_1fr]">
                    <dt className="font-mono text-xs text-muted-foreground">{row.key}</dt>
                    <dd className="break-all font-mono text-xs">
                      {row.redacted ? (
                        <span className="text-muted-foreground">redacted</span>
                      ) : (
                        <>
                          {row.displayValue}
                          {row.truncated && (
                            <span className="ml-1 text-muted-foreground">(truncated)</span>
                          )}
                        </>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <p className="text-center text-sm text-muted-foreground">
            <Link
              href="/auth/x/start"
              className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              X OAuth setup
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
