import { redirect } from "next/navigation";

export default async function LegacyTrendDetailRedirect({
  params,
}: {
  params: Promise<{ trendKey: string }>;
}) {
  const { trendKey } = await params;
  redirect(`/dashboard/intelligence/explore?signal=${encodeURIComponent(trendKey)}`);
}
