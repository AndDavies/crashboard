type ProcurementEventLink = {
  event_id?: unknown;
  transition_at?: unknown;
};

export function procurementEventProfileHref(value: unknown) {
  const links = (Array.isArray(value) ? value : value ? [value] : [])
    .filter((item): item is ProcurementEventLink => Boolean(item && typeof item === "object"))
    .filter((item) => String(item.event_id ?? "").trim())
    .sort((left, right) => {
      const rightTime = Date.parse(String(right.transition_at ?? ""));
      const leftTime = Date.parse(String(left.transition_at ?? ""));
      return (Number.isFinite(rightTime) ? rightTime : 0) -
        (Number.isFinite(leftTime) ? leftTime : 0);
    });
  const eventId = String(links[0]?.event_id ?? "").trim();
  return eventId
    ? `/dashboard/intelligence/events/${encodeURIComponent(eventId)}`
    : null;
}

export function catalogMatchHref(
  match: { id: string; kind: string; profileHref?: string | null },
  query: string,
) {
  if (match.profileHref) return match.profileHref;
  const params = new URLSearchParams({ q: query });
  if (match.kind !== "buying_opportunity") params.set("signal", match.id);
  return `/dashboard/intelligence/explore?${params}`;
}
