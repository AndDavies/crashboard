import type { Metadata } from "next";
import { WhoopConnectCard } from "@/components/dashboard/whoop-connect-card";
import { WhoopNextSteps } from "@/components/dashboard/whoop-next-steps";
import { Badge } from "@/components/ui/badge";
import { isWhoopConnected } from "@/lib/whoop/connection";

export const metadata: Metadata = { title: "Whoop" };

type Props = {
  searchParams: Promise<{
    whoop_connected?: string;
    whoop_error?: string;
  }>;
};

export default async function WhoopDashboardPage({ searchParams }: Props) {
  const params = await searchParams;
  const connected = await isWhoopConnected();

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            Whoop
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {connected
              ? "Your WHOOP account is linked. Open recovery, sleep, or strain when those views are ready."
              : "Connect your WHOOP account to get started. OAuth runs over a secure redirect — no data is loaded from WHOOP until we hook up the API."}
          </p>
        </div>
        <Badge
          variant={connected ? "secondary" : "outline"}
          className="h-6 w-fit shrink-0 font-normal sm:mt-1"
        >
          {connected ? "Connected" : "Not connected"}
        </Badge>
      </header>

      <WhoopConnectCard
        connected={connected}
        whoopConnected={params.whoop_connected}
        whoopError={params.whoop_error}
      />

      {connected ? <WhoopNextSteps /> : null}
    </div>
  );
}
