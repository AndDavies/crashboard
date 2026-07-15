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
    const documentSignals = await store.getDocumentSignals(storedSignal.evidence[0]!.documentId);
    expect(documentSignals[0]).toMatchObject({
      id: storedSignal.id,
      key: storedSignal.key,
      label: storedSignal.label,
    });
    const publicDocuments = await store.listSignalDocuments({ limit: 100 });
    expect(publicDocuments.length).toBeGreaterThan(0);
    const evidenceDocumentIds = new Set(buildDeterministicSignals(docs).flatMap((signal) => signal.evidence.map((item) => item.documentId)));
    expect(publicDocuments.every((document) => evidenceDocumentIds.has(document.id))).toBe(true);
    const publicSearch = await store.searchSignalDocuments("C-UAS", 100);
    expect(publicSearch.length).toBeGreaterThan(0);
    expect(publicSearch.every((document) => evidenceDocumentIds.has(document.id))).toBe(true);
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

  it("repairs an orphaned research job and overlays a validated result without changing trend scores", async () => {
    const store = new TursoIntelligenceStore(createClient({ url: ":memory:" }));
    await store.initialize();
    const docs = documents(12);
    await store.putDocuments(docs);
    const refreshId = await store.beginRefresh("test");
    const builtSignals = buildDeterministicSignals(docs);
    const signal = builtSignals[0]!;
    await store.putSignals(refreshId, builtSignals);
    await store.publishRefresh(refreshId);

    const requestId = await store.enqueueResearch({
      ownerId: "legacy-owner",
      signalId: "malformed-signal-key",
      signalLabel: signal.label,
      question: "What changed?",
    });
    const repair = await store.repairCanonicalOwner("google:andrew@example.com");
    expect(repair.requestsMigrated).toBe(1);
    expect(repair.jobsMigrated).toBe(1);
    expect(repair.signalIdsRepaired).toBe(1);

    const request = await store.getResearchRequest(requestId);
    expect(request).toMatchObject({
      ownerId: "google:andrew@example.com",
      signalId: signal.id,
      status: "pending",
    });
    const job = await store.leaseNextJob("google:andrew@example.com", "codex-test", "research");
    expect(job?.jobType).toBe("research");
    await store.markResearchRunning(requestId);
    expect((await store.getSignal(signal.id))?.researchStatus).toBe("running");

    await store.completeResearch(requestId, {
      whatChanged: "An official buyer confirmed a new procurement milestone.",
      whyNow: "The signal strengthened after an official procurement milestone and independent corroboration.",
      whyItMatters: "The milestone moves the signal from discussion toward funded implementation.",
      whatToWatch: "Watch the solicitation date, award value, delivery schedule, and operational user.",
      assessmentChange: "strengthened",
      evidenceStrength: "strong",
      sources: [
        {
          url: "https://official.example/procurement",
          title: "Official procurement notice",
          publisher: "Official buyer",
          publishedAt: "2026-07-15T12:00:00.000Z",
          authority: "official",
          passage: "The buyer confirmed the procurement milestone and delivery requirement.",
          supports: "Confirms the buyer, procurement stage, and timing.",
        },
        {
          url: "https://independent.example/analysis",
          title: "Independent programme analysis",
          publisher: "Independent source",
          publishedAt: "2026-07-15T13:00:00.000Z",
          authority: "independent",
          passage: "Independent reporting corroborated the programme milestone.",
          supports: "Corroborates the official announcement without changing the measured trend.",
        },
      ],
      unknowns: ["The final award value is not yet public."],
    });
    await store.completeJob(job!.id);

    const enriched = await store.getSignal(signal.id);
    expect(enriched?.researchStatus).toBe("completed");
    expect(enriched?.whyNow).toContain("official procurement milestone");
    expect(enriched?.evidence[0]).toMatchObject({
      url: "https://official.example/procurement",
      isResearch: true,
    });
    expect(enriched?.currentReach).toBeCloseTo(signal.currentReach * 100);
    expect((await store.listResearchRequests("google:andrew@example.com"))[0]?.status).toBe("completed");
  });
});
