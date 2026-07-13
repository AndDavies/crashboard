import { redirect } from "next/navigation";

export default async function LegacyTrendDetailRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ trendKey: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { trendKey } = await params;
  const incoming = await searchParams;
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(incoming)) {
    if (key === "signal" || key === "q") continue;
    if (Array.isArray(value)) value.forEach((item) => next.append(key, item));
    else if (value) next.set(key, value);
  }
  // V1 detail keys were normalized labels. Keep both the selection intent and
  // a search term so the matching v2 stable signal remains discoverable.
  next.set("signal", trendKey);
  next.set("q", Array.isArray(incoming.q) ? incoming.q[0] ?? trendKey : incoming.q ?? trendKey);
  redirect(`/dashboard/intelligence/explore?${next}`);
}
