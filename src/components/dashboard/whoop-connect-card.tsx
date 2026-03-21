import Link from "next/link";
import { getAppSiteUrl, getWhoopRedirectUri } from "@/lib/whoop/oauth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type Props = {
  connected: boolean;
  whoopConnected?: string;
  whoopError?: string;
};

/**
 * WHOOP linking is started only from the dashboard; `/api/whoop/authorize` requires auth.
 */
export function WhoopConnectCard({
  connected,
  whoopConnected,
  whoopError,
}: Props) {
  const callbackUrl =
    getWhoopRedirectUri() ?? `${getAppSiteUrl() ?? "https://crashboard.dev"}/auth/whoop/callback`;

  return (
    <Card className="max-w-xl shadow-none">
      <CardHeader className="border-b border-border/60 pb-4">
        <CardTitle className="text-base">WHOOP connection</CardTitle>
        <CardDescription>
          Connect your WHOOP account from here. You must be signed in — the link
          goes through a protected route, then returns to this page after WHOOP
          authorization.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {whoopError ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-foreground"
          >
            {whoopError}
          </p>
        ) : null}
        {whoopConnected === "1" ? (
          <p
            role="status"
            className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground"
          >
            WHOOP authorization completed. Tokens are stored for this browser
            session; wire API calls when you&apos;re ready.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button nativeButton={false} render={<Link href="/api/whoop/authorize" />}>
            {connected ? "Reconnect WHOOP" : "Connect WHOOP"}
          </Button>
          {connected ? (
            <span className="text-xs text-muted-foreground">
              Access token present (httpOnly cookie).
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              Not connected yet.
            </span>
          )}
        </div>

        <Separator className="bg-border/60" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Register this callback URL with WHOOP (must match your env exactly):{" "}
          <code className="break-all rounded bg-muted px-1 py-0.5 text-[11px]">
            {callbackUrl}
          </code>
        </p>
      </CardContent>
    </Card>
  );
}
