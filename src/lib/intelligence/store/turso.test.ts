import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";
import { buildDeterministicSignals } from "@/lib/intelligence/agent-worker/deterministic";
import { TursoIntelligenceStore } from "@/lib/intelligence/store/turso";
import type { IntelligenceStoredDocument } from "@/lib/intelligence/store";

function documents(count: number): IntelligenceStoredDocument[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `document-${index}`,
    externalId: `external-${index}`,
    sourceType: "email_newsletter",
    sourceFamily: `Source ${(index % 4) + 1}`,
    title: `C-UAS procurement update ${index}`,
    publisher: `Source ${(index % 4) + 1}`,
    publishedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    canonicalUrl: `https://example.invalid/${index}`,
    contentText: "C-UAS procurement funding trial deployment autonomous defence C-UAS",
    contentHash: `hash-${index}`,
    editorialTokens: 9,
    segmentationConfidence: 0.9,
    parserVersion: "test.v1",
  }));
}

describe("Turso Intelligence generations", () => {
  it("keeps the last valid refresh active when a later refresh fails", async () => {
    const store = new TursoIntelligenceStore(createClient({ url: ":memory:" }));
    await store.initialize();
    const docs = documents(12);
    await store.putDocuments(docs);
    const validRefresh = await store.beginRefresh("test");
    await store.putSignals(validRefresh, buildDeterministicSignals(docs));
    await store.publishRefresh(validRefresh);

    const invalidRefresh = await store.beginRefresh("test");
    const validation = await store.validateRefresh(invalidRefresh);
    expect(validation.ok).toBe(false);
    await expect(store.publishRefresh(invalidRefresh)).rejects.toThrow("validation failed");

    const health = await store.health();
    expect(health.activeRefreshId).toBe(validRefresh);
    const response = await store.getSignals();
    expect(response.dataStatus).toBe("ready");
    expect(response.signals.length).toBeGreaterThan(0);
    const storedSignal = buildDeterministicSignals(docs)[0]!;
    const returnedSignal = response.signals.find((signal) => signal.id === storedSignal.id)!;
    expect(returnedSignal.currentReach).toBeCloseTo(storedSignal.currentReach * 100);
    expect(returnedSignal.previousReach).toBeCloseTo(storedSignal.previousReach * 100);
    expect(returnedSignal.series[0]?.shareOfCoverage).toBeCloseTo(
      storedSignal.series[0]!.shareOfCoverage * 100,
    );

    const detail = await store.getSignal(storedSignal.id);
    expect(detail?.currentReach).toBeCloseTo(storedSignal.currentReach * 100);
    expect(detail?.series[0]?.shareOfCoverage).toBeCloseTo(
      storedSignal.series[0]!.shareOfCoverage * 100,
    );
  });

  it("leases jobs once and persists checkpoints", async () => {
    const store = new TursoIntelligenceStore(createClient({ url: ":memory:" }));
    await store.initialize();
    const jobId = await store.enqueueJob({ ownerId: "owner", jobType: "daily_refresh" });
    const leased = await store.leaseNextJob("owner", "codex-test");
    expect(leased?.id).toBe(jobId);
    expect(await store.leaseNextJob("owner", "other-worker")).toBeNull();
    await store.checkpointJob(jobId, { processed: 10 });
    await store.completeJob(jobId);
    expect((await store.health()).pendingJobs).toBe(0);
  });

  it("rejects a refresh containing a blocked generic signal label", async () => {
    const store = new TursoIntelligenceStore(createClient({ url: ":memory:" }));
    await store.initialize();
    const docs = documents(12);
    await store.putDocuments(docs);
    const refreshId = await store.beginRefresh("test");
    const signal = buildDeterministicSignals(docs)[0]!;
    await store.putSignals(refreshId, [{ ...signal, label: "July" }]);

    const validation = await store.validateRefresh(refreshId);
    expect(validation.ok).toBe(false);
    expect(validation.errors.join(" ")).toContain("blocked generic signal labels: July");
  });
});
