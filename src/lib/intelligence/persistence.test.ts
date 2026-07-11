import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/intelligence/signal-persistence", () => ({
  persistSourceIdentity: vi.fn().mockResolvedValue("source-identity-1"),
  persistDocumentSegments: vi
    .fn()
    .mockResolvedValue(new Map([[0, { id: "segment-1", position: 0 }]])),
  persistConceptGraph: vi.fn().mockResolvedValue(["concept-1"]),
}));
import {
  __testables,
  persistIntelligenceDocument,
  synchronizeDocumentModelEvents,
} from "@/lib/intelligence/persistence";

type QueryState = {
  table: string;
  operation: "select" | "delete" | "update" | null;
  columns: string | null;
  values: unknown;
  filters: Array<{ method: "eq" | "in"; column: string; value: unknown }>;
};

function filterValue(state: QueryState, column: string) {
  return state.filters.find((filter) => filter.column === column)?.value;
}

function cleanupAdmin() {
  const completed: QueryState[] = [];
  const from = (table: string) => {
    const state: QueryState = {
      table,
      operation: null,
      columns: null,
      values: null,
      filters: [],
    };
    const builder = {
      select(columns: string) {
        state.operation = "select";
        state.columns = columns;
        return builder;
      },
      delete() {
        state.operation = "delete";
        return builder;
      },
      update(values: unknown) {
        state.operation = "update";
        state.values = values;
        return builder;
      },
      eq(column: string, value: unknown) {
        state.filters.push({ method: "eq", column, value });
        return builder;
      },
      in(column: string, value: unknown) {
        state.filters.push({ method: "in", column, value });
        return builder;
      },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        completed.push(structuredClone(state));
        let result: { data?: unknown[]; error: null } = { data: [], error: null };
        if (
          table === "intelligence_event_evidence" &&
          state.operation === "select" &&
          filterValue(state, "document_id")
        ) {
          result = {
            data: [
              { event_id: "event-current" },
              { event_id: "event-orphan" },
              { event_id: "event-shared" },
              { event_id: "event-manual" },
            ],
            error: null,
          };
        } else if (
          table === "intelligence_cluster_documents" &&
          state.operation === "select" &&
          state.columns === "cluster_id" &&
          filterValue(state, "document_id")
        ) {
          result = {
            data: [
              { cluster_id: "cluster-current" },
              { cluster_id: "cluster-orphan" },
              { cluster_id: "cluster-shared" },
              { cluster_id: "cluster-ghost" },
              { cluster_id: "cluster-manual" },
              { cluster_id: "cluster-topic" },
            ],
            error: null,
          };
        } else if (
          table === "intelligence_clusters" &&
          state.operation === "select" &&
          filterValue(state, "canonical_document_id")
        ) {
          result = {
            data: [
              { id: "cluster-current", cluster_type: "event" },
              { id: "cluster-orphan", cluster_type: "event" },
              { id: "cluster-shared", cluster_type: "event" },
              { id: "cluster-manual", cluster_type: "event" },
              { id: "cluster-canonical-ghost", cluster_type: "event" },
            ],
            error: null,
          };
        } else if (
          table === "intelligence_clusters" &&
          state.operation === "select" &&
          filterValue(state, "id")
        ) {
          result = {
            data: [
              { id: "cluster-current", cluster_type: "event" },
              { id: "cluster-orphan", cluster_type: "event" },
              { id: "cluster-shared", cluster_type: "event" },
              { id: "cluster-ghost", cluster_type: "event" },
              { id: "cluster-manual", cluster_type: "event" },
            ],
            error: null,
          };
        } else if (
          table === "intelligence_events" &&
          state.operation === "select" &&
          state.columns?.includes("extraction_version")
        ) {
          const events = [
            {
              id: "event-current",
              cluster_id: "cluster-current",
              extraction_version: "intelligence-v1",
              review_status: "unreviewed",
            },
            {
              id: "event-orphan",
              cluster_id: "cluster-orphan",
              extraction_version: "intelligence-v1",
              review_status: "unreviewed",
            },
            {
              id: "event-shared",
              cluster_id: "cluster-shared",
              extraction_version: "intelligence-v1",
              review_status: "unreviewed",
            },
            {
              id: "event-manual",
              cluster_id: "cluster-manual",
              extraction_version: "intelligence-v1",
              review_status: "confirmed",
            },
          ];
          if (filterValue(state, "cluster_id")) {
            events.push({
              id: "event-ghost",
              cluster_id: "cluster-ghost",
              extraction_version: "intelligence-v1",
              review_status: "unreviewed",
            });
          }
          result = { data: events, error: null };
        } else if (
          table === "intelligence_event_evidence" &&
          state.operation === "select"
        ) {
          result = { data: [{ event_id: "event-shared" }], error: null };
        } else if (
          table === "intelligence_events" &&
          state.operation === "select" &&
          state.columns === "cluster_id"
        ) {
          result = { data: [{ cluster_id: "cluster-shared" }], error: null };
        } else if (
          table === "intelligence_cluster_documents" &&
          state.operation === "select" &&
          state.columns === "cluster_id,document_id"
        ) {
          result = {
            data: [{ cluster_id: "cluster-shared", document_id: "document-2" }],
            error: null,
          };
        }
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return builder;
  };

  return {
    admin: { from } as unknown as SupabaseClient,
    completed,
  };
}

function existingEnrichmentAdmin() {
  let updatePayload: Record<string, unknown> | null = null;
  const from = (table: string) => {
    if (table !== "documents") throw new Error(`Unexpected table ${table}.`);
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "document-1",
                  summary_short: "Prior enriched summary",
                  extraction_method: "openai_structured",
                  extraction_version: "intelligence-v1",
                  metadata: {
                    themes: ["Prior theme"],
                    primary_domain: "Defence industry",
                    novelty_signals: ["Prior novelty"],
                    retained_metadata: "keep-me",
                  },
                  quality_flags: { flags: ["prior_quality_flag"] },
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
      update: (values: Record<string, unknown>) => {
        updatePayload = values;
        return {
          eq: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      },
    };
  };
  return {
    admin: { from } as unknown as SupabaseClient,
    getUpdatePayload: () => updatePayload,
  };
}

describe("intelligence persistence safeguards", () => {
  it("allows model updates only for unreviewed events", () => {
    expect(__testables.canModelUpdateEvent("unreviewed")).toBe(true);
    expect(__testables.canModelUpdateEvent("confirmed")).toBe(false);
    expect(__testables.canModelUpdateEvent("corrected")).toBe(false);
    expect(__testables.canModelUpdateEvent("rejected")).toBe(false);
  });

  it("diffs omitted associations and excludes manual or rule key conflicts", () => {
    const existing = [
      { entity_id: "entity-1", role: "supplier" },
      { entity_id: "entity-2", role: "buyer" },
    ];
    const current = [{ entity_id: "entity-1", role: "developer" }];
    expect(
      __testables.staleEntityAssociations(
        existing,
        current,
        __testables.entityAssociationKey,
      ),
    ).toEqual(existing);

    const candidates = [
      { entity_id: "entity-1", role: "developer", source: "model" },
      { entity_id: "entity-2", role: "buyer", source: "model" },
      { entity_id: "entity-3", role: "partner", source: "model" },
    ];
    const protectedKeys = new Set([
      "entity-1:developer", // existing manual row
      "entity-2:buyer", // existing rule row
    ]);
    expect(
      __testables.excludeProtectedAssociationKeys(
        candidates,
        protectedKeys,
        __testables.entityAssociationKey,
      ),
    ).toEqual([{ entity_id: "entity-3", role: "partner", source: "model" }]);
  });

  it("preserves an existing reviewed evidence row but permits a missing link", () => {
    const evidence = [
      { event_id: "reviewed-existing", evidence_text: "new model wording" },
      { event_id: "reviewed-new-link", evidence_text: "new supporting evidence" },
    ];
    expect(
      __testables.excludeProtectedAssociationKeys(
        evidence,
        new Set(["reviewed-existing"]),
        (row) => row.event_id,
      ),
    ).toEqual([
      { event_id: "reviewed-new-link", evidence_text: "new supporting evidence" },
    ]);
  });

  it("keeps prior enrichment fields while marking a raw-first retry pending", async () => {
    const { admin, getUpdatePayload } = existingEnrichmentAdmin();
    const result = await persistIntelligenceDocument(
      admin,
      {
        ownerId: "owner-1",
        sourceType: "email_newsletter",
        externalId: "message-1",
        originalUrl: "https://mail.google.com/message-1",
        title: "Updated raw title",
        contentText: "  Updated   raw content.  ",
        summaryShort: "Raw Gmail snippet",
        labels: ["Newsletters/Defence"],
        sourceChannel: "gmail_oauth",
        metadata: { gmail_thread_id: "thread-1" },
      },
      {
        preserveExistingEnrichment: true,
        processingQualityFlags: ["enrichment_pending"],
      },
    );

    expect(result.deduped).toBe(true);
    expect(getUpdatePayload()).toEqual(
      expect.objectContaining({
        content_text: "Updated raw content.",
        summary_short: "Prior enriched summary",
        extraction_method: "openai_structured",
        extraction_version: "intelligence-v1",
        metadata: expect.objectContaining({
          themes: ["Prior theme"],
          primary_domain: "Defence industry",
          novelty_signals: ["Prior novelty"],
          retained_metadata: "keep-me",
          gmail_thread_id: "thread-1",
          labels: ["Newsletters/Defence"],
          source_channel: "gmail_oauth",
        }),
        quality_flags: {
          flags: ["prior_quality_flag", "enrichment_pending"],
        },
      }),
    );
    expect(getUpdatePayload()).not.toHaveProperty("review_status");
    expect(getUpdatePayload()).not.toHaveProperty("captured_at");
  });

  it("cleans evidence-less event ghosts and repairs surviving canonical clusters", async () => {
    const { admin, completed } = cleanupAdmin();

    await synchronizeDocumentModelEvents(
      admin,
      "owner-1",
      "document-1",
      ["event-current"],
      ["cluster-current"],
    );

    const evidenceDelete = completed.find(
      (query) =>
        query.table === "intelligence_event_evidence" && query.operation === "delete",
    );
    expect(filterValue(evidenceDelete as QueryState, "event_id")).toEqual([
      "event-orphan",
      "event-shared",
      "event-ghost",
    ]);

    const eventDelete = completed.find(
      (query) => query.table === "intelligence_events" && query.operation === "delete",
    );
    expect(filterValue(eventDelete as QueryState, "id")).toEqual([
      "event-orphan",
      "event-ghost",
    ]);

    const clusterDelete = completed.find(
      (query) => query.table === "intelligence_clusters" && query.operation === "delete",
    );
    expect(filterValue(clusterDelete as QueryState, "id")).toEqual([
      "cluster-orphan",
      "cluster-ghost",
      "cluster-canonical-ghost",
    ]);

    const canonicalRepair = completed.find(
      (query) =>
        query.table === "intelligence_clusters" &&
        query.operation === "update" &&
        filterValue(query, "id") === "cluster-shared",
    );
    expect(canonicalRepair?.values).toEqual(
      expect.objectContaining({ canonical_document_id: "document-2" }),
    );

    const eventClusterDiscovery = completed.find(
      (query) =>
        query.table === "intelligence_clusters" &&
        query.operation === "select" &&
        Array.isArray(filterValue(query, "id")),
    );
    expect(filterValue(eventClusterDiscovery as QueryState, "cluster_type")).toBe(
      "event",
    );
    const destructiveClusterIds = completed
      .filter(
        (query) =>
          query.table === "intelligence_clusters" &&
          (query.operation === "delete" || query.operation === "update"),
      )
      .flatMap((query) => {
        const ids = filterValue(query, "id");
        return Array.isArray(ids) ? ids.map(String) : [String(ids)];
      });
    expect(destructiveClusterIds).not.toContain("cluster-topic");
    expect(destructiveClusterIds).not.toContain("cluster-manual");
  });
});
