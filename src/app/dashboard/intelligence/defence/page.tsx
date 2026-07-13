import { redirect } from "next/navigation";

function append(params: URLSearchParams, key: string, value: string | string[] | undefined) {
  if (key === "lens") return;
  if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
  else if (value) params.set(key, value);
}
export default async function DefenceRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const incoming = await searchParams;
  const params = new URLSearchParams({ lens: "defence" });
  Object.entries(incoming).forEach(([key, value]) => append(params, key, value));
  redirect(`/dashboard/intelligence/explore?${params}`);
}
