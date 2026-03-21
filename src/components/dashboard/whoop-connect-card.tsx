import Link from "next/link";
import { CircleCheck, Link2 } from "lucide-react";
import { getAppSiteUrl, getWhoopRedirectUri } from "@/lib/whoop/oauth";
import { Badge } from "@/components/ui/badge";
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
 * WHOOP linking starts from `/api/whoop/authorize` (requires dashboard auth).
 */
export function WhoopConnectCard({
  connected,
  whoopConnected,
  whoopError,
}: Props) {
  const callbackUrl =
    getWhoopRedirectUri() ??
    `${getAppSiteUrl() ?? "https://crashboard.dev"}/auth/whoop/callback`;

  if (connected) {
    return (
      <Card className="max-w-2xl shadow-none">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-emerald-600 dark:text-emerald-500">
                <CircleCheck className="size-5" aria-hidden />
              </span>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">WHOOP is connected</CardTitle>
                  <Badge variant="secondary" className="font-normal">
                    Active
                  </Badge>
                </div>
                <CardDescription className="text-sm text-muted-foreground">
                  Your account is linked. Strain, recovery, and sleep pages will
                  use this session once the WHOOP API is wired up.
                </CardDescription>
              </div>
            </div>
          </div>
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
              Authorization finished successfully.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href="/api/whoop/authorize" />}
            >
              Reconnect WHOOP
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl shadow-none">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-muted-foreground/35 bg-muted/30 text-muted-foreground">
            <Link2 className="size-5" aria-hidden />
          </span>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">Connect WHOOP</CardTitle>
              <Badge variant="outline" className="font-normal">
                Not connected
              </Badge>
            </div>
            <CardDescription className="text-sm text-muted-foreground">
              Link your WHOOP account to unlock strain, recovery, and sleep in
              this dashboard. You&apos;ll sign in with WHOOP and return here
              when done.
            </CardDescription>
          </div>
        </div>
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

        <Button
          nativeButton={false}
          render={<Link href="/api/whoop/authorize" />}
          className="w-full sm:w-auto"
        >
          Connect WHOOP account
        </Button>

        <Separator className="bg-border/60" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          First-time setup: register this OAuth callback URL in the WHOOP
          developer dashboard (must match your deployment exactly):
        </p>
        <code className="block break-all rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-[11px] text-foreground">
          {callbackUrl}
        </code>
      </CardContent>
    </Card>
  );
}
