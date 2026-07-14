export type IntelligenceRankedSearchResult = {
  id: string;
  resultType: "catalog" | "document";
};

export function unifiedRankedSearchResults(
  catalog: Array<{ id: string }>,
  results: Array<{ documentId: string }>,
  limit: number,
) {
  const ranked: IntelligenceRankedSearchResult[] = [];
  const seen = new Set<string>();
  const add = (item: IntelligenceRankedSearchResult) => {
    if (seen.has(item.id) || ranked.length >= limit) return;
    seen.add(item.id);
    ranked.push(item);
  };
  catalog.forEach((item) => add({ id: item.id, resultType: "catalog" }));
  results.forEach((item) => add({ id: `document:${item.documentId}`, resultType: "document" }));
  return ranked;
}
