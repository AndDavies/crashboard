import type { Metadata } from "next";
import { cookies } from "next/headers";
import { WhoopConnectCard } from "@/components/dashboard/whoop-connect-card";
import { DashboardPlaceholder } from "@/components/dashboard/dashboard-placeholder";

export const metadata: Metadata = { title: "Whoop" };

type Props = {
  searchParams: Promise<{
    whoop_connected?: string;
    whoop_error?: string;
  }>;
};

export default async function WhoopDashboardPage({ searchParams }: Props) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const hasWhoopToken = Boolean(
    cookieStore.get("whoop_access_token")?.value,
  );

  return (
    <div className="space-y-8">
      <WhoopConnectCard
        connected={hasWhoopToken}
        whoopConnected={params.whoop_connected}
        whoopError={params.whoop_error}
      />
      <DashboardPlaceholder description="Summary metrics and quick links into recovery, sleep, and strain." />
    </div>
  );
}
