import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { __testables, titleSimilarity } from "@/lib/intelligence/dedup-v2";

describe("story and event deduplication", () => {
  it("orders every offset-paginated deduplication read", () => {
    const source = readFileSync(
      `${process.cwd()}/src/lib/intelligence/dedup-v2.ts`,
      "utf8",
    );
    const pages = source.split(".range(from, to)");
    expect(pages).toHaveLength(18);
    for (const page of pages.slice(0, -1)) {
      const query = page.slice(page.lastIndexOf("fetchPages<DbRow>"));
      expect(query).toContain(".order(");
    }
  });

  it("recognizes equivalent announcement titles but not unrelated roundups", () => {
    expect(titleSimilarity(
      "Canada awards C-UAS interceptor trial contract",
      "C-UAS interceptor trial contract awarded by Canada",
    )).toBe(1);
    expect(titleSimilarity(
      "Canada awards C-UAS interceptor trial contract",
      "Weekly defence industry roundup",
    )).toBeLessThan(0.3);
  });

  it("prevents a research story from bridging two measurement stories", () => {
    const measurementStories = [
      {
        id: "measurement-a",
        document_id: "document-a",
        story_title: "Alpha Bravo Charlie",
        published_at: "2026-07-10T12:00:00.000Z",
        content_hash: "measurement-a",
        dedup_cohort: "measurement",
      },
      {
        id: "measurement-b",
        document_id: "document-b",
        story_title: "Charlie Delta Echo",
        published_at: "2026-07-10T12:00:00.000Z",
        content_hash: "measurement-b",
        dedup_cohort: "measurement",
      },
    ];
    const bridge = {
      id: "research-bridge",
      document_id: "research-document",
      story_title: "Alpha Bravo Charlie Delta Echo",
      published_at: "2026-07-10T12:00:00.000Z",
      content_hash: "research-bridge",
      dedup_cohort: "non_measurement",
    };
    const vectors = new Map([
      ["measurement-a", [1, 0]],
      ["measurement-b", [0.5, 0.8660254]],
      ["research-bridge", [0.8660254, 0.5]],
    ]);
    const group = (segments: Array<Record<string, unknown>>) =>
      __testables.groupStoryCandidates({
        segments,
        vectors,
        principalsByDocument: new Map(),
        eventTypesByDocument: new Map(),
      }).groups.map((rows) => rows.map((row) => String(row.id)).sort()).sort();

    const sameCohort = group([
      ...measurementStories,
      { ...bridge, dedup_cohort: "measurement" },
    ]);
    expect(sameCohort).toHaveLength(2);
    expect(sameCohort.some((members) =>
      members.includes("measurement-a") && members.includes("measurement-b")
    )).toBe(false);
    expect(group([...measurementStories, bridge])).toEqual([
      ["measurement-a"],
      ["measurement-b"],
      ["research-bridge"],
    ]);
  });

  it("never semantically merges unrelated segments from the same newsletter", () => {
    const segments = [
      {
        id: "blackberry-segment",
        document_id: "newsletter",
        story_title: "Canada awards BlackBerry secure communications contract",
        published_at: "2026-07-10T12:00:00.000Z",
        content_hash: "blackberry-content",
        dedup_cohort: "measurement",
      },
      {
        id: "larus-segment",
        document_id: "newsletter",
        story_title: "Canada awards Larus defence AI contract",
        published_at: "2026-07-10T12:00:00.000Z",
        content_hash: "larus-content",
        dedup_cohort: "measurement",
      },
    ];
    const result = __testables.groupStoryCandidates({
      segments,
      vectors: new Map([
        ["blackberry-segment", [1, 0]],
        ["larus-segment", [1, 0]],
      ]),
      principalsByDocument: new Map([["newsletter", new Set(["shared-programme"])]]),
      eventTypesByDocument: new Map([["newsletter", new Set(["award"])]]),
    });

    expect(result.groups.map((group) => group.map((row) => row.id))).toEqual([
      ["blackberry-segment"],
      ["larus-segment"],
    ]);
  });

  it("deduplicates measurement and research events only within their own cohorts", () => {
    const events = [
      {
        id: "measurement-a",
        title: "Canada awards Counter UAS interceptor contract",
        event_type: "award",
        announced_at: "2026-07-10",
      },
      {
        id: "measurement-b",
        title: "Canada awards Counter UAS interceptor contract",
        event_type: "award",
        announced_at: "2026-07-11",
      },
      {
        id: "research-only",
        title: "Canada awards Counter UAS interceptor contract",
        event_type: "award",
        announced_at: "2026-07-11",
      },
    ];
    const groups = __testables.groupEventCandidates({
      events,
      cohortByEvent: new Map([
        ["measurement-a", "measurement"],
        ["measurement-b", "measurement"],
        ["research-only", "non_measurement"],
      ]),
      principals: () => [],
    }).map((rows) => rows.map((row) => String(row.id)).sort()).sort();

    expect(groups).toEqual([
      ["measurement-a", "measurement-b"],
      ["research-only"],
    ]);
  });

  it("does not let research evidence supply the principal for a measurement event", () => {
    const evidenceByEvent = new Map([
      ["event", [
        { event_id: "event", document_id: "measurement-document" },
        { event_id: "event", document_id: "research-document" },
      ]],
    ]);
    const aligned = __testables.cohortAlignedEvidenceDocumentIds({
      eventId: "event",
      cohortByEvent: new Map([["event", "measurement"]]),
      evidenceByEvent,
      documentCohorts: new Map([
        ["measurement-document", "measurement"],
        ["research-document", "non_measurement"],
      ]),
    });

    expect(aligned).toEqual(["measurement-document"]);
    expect(__testables.principalEntity([
      { id: "measurement-programme", type: "program", role: "subject" },
    ])).toBe("measurement-programme");
    expect(__testables.principalEntity([])).toBeNull();
  });

  it("does not collapse unrelated announcements that share a company or agency", () => {
    const events = [
      {
        id: "microsoft-agent",
        title: "Microsoft releases Fara 1.5 browser agent models",
        event_type: "development",
        announced_at: "2026-07-10",
      },
      {
        id: "cohere-open-source",
        title: "Cohere open-sources Command A Plus model",
        event_type: "development",
        announced_at: "2026-07-11",
      },
      {
        id: "blackberry-award",
        title: "Canada awards BlackBerry secure communications contract",
        event_type: "award",
        announced_at: "2026-07-10",
      },
      {
        id: "larus-award",
        title: "Canada awards Larus defence AI contract",
        event_type: "award",
        announced_at: "2026-07-11",
      },
    ];
    const groups = __testables.groupEventCandidates({
      events,
      cohortByEvent: new Map(events.map((event) => [event.id, "measurement" as const])),
      principals: () => [{ id: "shared-organization", strength: "organization" as const }],
    });

    expect(groups.map((group) => group.map((event) => event.id))).toHaveLength(4);
  });

  it("does not use a newsletter-wide system as an event matching principal", () => {
    const events = [
      {
        id: "blackberry-award",
        title: "Canada awards BlackBerry secure communications contract",
        event_type: "award",
        announced_at: "2026-07-10",
      },
      {
        id: "larus-award",
        title: "Canada awards Larus defence AI contract",
        event_type: "award",
        announced_at: "2026-07-11",
      },
    ];
    const principalByEvent = __testables.directEventPrincipals([
      {
        event_id: "blackberry-award",
        entity_id: "blackberry",
        role: "subject",
        source: "model",
        confidence: 0.9,
      },
      {
        event_id: "larus-award",
        entity_id: "larus",
        role: "subject",
        source: "model",
        confidence: 0.9,
      },
      // Both events came from one newsletter, so document-level inference
      // attached this unrelated programme to each event. It must not be used
      // as an event identity signal.
      {
        event_id: "blackberry-award",
        entity_id: "newsletter-system",
        role: "subject",
        source: "rule",
        confidence: 0.9,
        metadata: { inferred_from_evidence_document: true },
      },
      {
        event_id: "larus-award",
        entity_id: "newsletter-system",
        role: "subject",
        source: "rule",
        confidence: 0.9,
        metadata: { inferred_from_evidence_document: true },
      },
    ], new Map([
      ["blackberry", "organization"],
      ["larus", "organization"],
      ["newsletter-system", "product_system"],
    ]));
    const groups = __testables.groupEventCandidates({
      events,
      cohortByEvent: new Map(events.map((event) => [event.id, "measurement" as const])),
      principals: (eventId) => principalByEvent.get(eventId) ?? [],
    });

    expect(principalByEvent.get("blackberry-award"))
      .toEqual([{ id: "blackberry", strength: "organization" }]);
    expect(principalByEvent.get("larus-award"))
      .toEqual([{ id: "larus", strength: "organization" }]);
    expect(groups).toHaveLength(2);

    // Even if a contaminated association slips through as direct, the shared
    // generic words "Canada", "award", and "contract" are not corroboration.
    expect(__testables.groupEventCandidates({
      events,
      cohortByEvent: new Map(events.map((event) => [event.id, "measurement" as const])),
      principals: () => [{ id: "newsletter-system", strength: "strong" as const }],
    })).toHaveLength(2);
  });

  it("accepts legacy direct model principals at the production 0.5 default", () => {
    const principals = __testables.directEventPrincipals([
      {
        event_id: "legacy-event",
        entity_id: "legacy-system",
        role: "subject",
        source: "model",
        confidence: 0.5,
        extraction_version: null,
      },
      {
        event_id: "low-current-event",
        entity_id: "current-system",
        role: "subject",
        source: "model",
        confidence: 0.5,
        extraction_version: "intelligence-v2",
      },
    ], new Map([
      ["legacy-system", "product_system"],
      ["current-system", "product_system"],
    ]));

    expect(principals.get("legacy-event"))
      .toEqual([{ id: "legacy-system", strength: "strong" }]);
    expect(principals.has("low-current-event")).toBe(false);
  });

  it("hard-vetoes conflicting model identifiers before other match evidence", () => {
    const events = [
      {
        id: "f35",
        title: "Canada awards F-35 training system contract",
        event_type: "award",
        announced_at: "2026-07-10",
      },
      {
        id: "f350",
        title: "Canada awards F-350 training system contract",
        event_type: "award",
        announced_at: "2026-07-10",
      },
    ];
    expect(__testables.groupEventCandidates({
      events,
      cohortByEvent: new Map(events.map((event) => [event.id, "measurement" as const])),
      principals: () => [{ id: "contaminated-system", strength: "strong" as const }],
      exactEvidenceKeys: (eventId) => new Map([
        ["url:https://example.test/shared", new Set([`document-${eventId}`])],
      ]),
    })).toHaveLength(2);
  });

  it("requires title corroboration for an exact programme or system", () => {
    const similar = [
      {
        id: "lucas-a",
        title: "Shield AI announces LUCAS autonomous aircraft",
        event_type: "development",
        announced_at: "2026-07-10",
      },
      {
        id: "lucas-b",
        title: "Shield AI launches LUCAS drone system",
        event_type: "development",
        announced_at: "2026-07-11",
      },
    ];
    const unrelated = {
      id: "lucas-unrelated",
      title: "NATO publishes a new cloud security framework",
      event_type: "development",
      announced_at: "2026-07-11",
    };
    const groups = __testables.groupEventCandidates({
      events: [...similar, unrelated],
      cohortByEvent: new Map(
        [...similar, unrelated].map((event) => [event.id, "measurement" as const]),
      ),
      principals: () => [{ id: "lucas-system", strength: "strong" as const }],
    }).map((group) => group.map((event) => String(event.id)).sort()).sort();

    expect(groups).toEqual([
      ["lucas-a", "lucas-b"],
      ["lucas-unrelated"],
    ]);
  });

  it("uses stricter title evidence for broad capabilities", () => {
    const events = [
      {
        id: "medical-robots",
        title: "DARPA begins trials of autonomous medical robots",
        event_type: "trial_pilot",
        announced_at: "2026-07-10",
      },
      {
        id: "cmmc",
        title: "Contractor completes CMMC certification trial",
        event_type: "trial_pilot",
        announced_at: "2026-07-11",
      },
    ];
    const groups = __testables.groupEventCandidates({
      events,
      cohortByEvent: new Map(events.map((event) => [event.id, "measurement" as const])),
      principals: () => [{ id: "artificial-intelligence", strength: "capability" as const }],
    });

    expect(groups).toHaveLength(2);
  });

  it("accepts exact event-level evidence without a shared principal", () => {
    const events = [
      {
        id: "official",
        title: "Ottawa selects a new counter-drone interceptor",
        event_type: "award",
        announced_at: "2026-07-10",
      },
      {
        id: "newsletter",
        title: "Canadian C-UAS programme reaches contract award",
        event_type: "award",
        announced_at: "2026-07-11",
      },
    ];
    const groups = __testables.groupEventCandidates({
      events,
      cohortByEvent: new Map(events.map((event) => [event.id, "measurement" as const])),
      principals: () => [],
      exactEvidenceKeys: (eventId) => new Map([
        ["url:https://example.test/award", new Set([`document-${eventId}`])],
      ]),
    });

    expect(groups).toHaveLength(1);
  });

  it("does not use a multi-event document as exact event identity", () => {
    const events = [
      { id: "award-a" },
      { id: "award-b" },
    ];
    const keys = __testables.buildExactEventEvidenceKeys({
      events,
      evidenceByEvent: new Map([
        ["award-a", [{ document_id: "roundup", evidence_text: "Alpha award evidence" }]],
        ["award-b", [{ document_id: "roundup", evidence_text: "Bravo award evidence" }]],
      ]),
      documents: [{
        id: "roundup",
        canonical_url: "https://example.test/roundup",
        content_hash: "shared-roundup-hash",
      }],
    });

    expect(keys.get("award-a")?.size).toBe(0);
    expect(keys.get("award-b")?.size).toBe(0);
  });

  it("does not treat Gmail transport URLs as exact event identity", () => {
    const events = [{ id: "alpha" }, { id: "bravo" }];
    const keys = __testables.buildExactEventEvidenceKeys({
      events,
      evidenceByEvent: new Map([
        ["alpha", [{ document_id: "mail-a", evidence_text: "Alpha" }]],
        ["bravo", [{ document_id: "mail-b", evidence_text: "Bravo" }]],
      ]),
      documents: [
        {
          id: "mail-a",
          canonical_url: "https://publisher.test/",
          original_url: "https://mail.google.com/mail/u/0/#all/message-a",
        },
        {
          id: "mail-b",
          canonical_url: "https://publisher.test/",
          original_url: "https://mail.google.com/mail/u/0/#all/message-b",
        },
      ],
    });

    expect(keys.get("alpha")?.size).toBe(0);
    expect(keys.get("bravo")?.size).toBe(0);
  });

  it("does not merge distinct products or funding rounds through a broad programme", () => {
    const claudeEvents = [
      {
        id: "security",
        title: "Claude Code Security limited research preview",
        event_type: "development",
        announced_at: "2026-02-23",
      },
      {
        id: "context",
        title: "Context Mode for Claude Code",
        event_type: "development",
        announced_at: "2026-03-02",
      },
    ];
    const fundingEvents = [
      {
        id: "omen",
        title: "Omen AI raised $31 million Series A",
        event_type: "funding_investment",
        announced_at: "2026-06-30",
      },
      {
        id: "straiker",
        title: "Straiker raised $64 million Series A",
        event_type: "funding_investment",
        announced_at: "2026-06-30",
      },
    ];

    for (const events of [claudeEvents, fundingEvents]) {
      expect(__testables.groupEventCandidates({
        events,
        cohortByEvent: new Map(events.map((event) => [event.id, "measurement" as const])),
        principals: () => [{ id: "broad-programme", strength: "strong" as const }],
      })).toHaveLength(2);
    }
  });

  it("does not count a shared product name as proof of the same action", () => {
    const cases = [
      {
        label: "Claude Opus 4.6",
        events: [
          {
            id: "opus-release",
            title: "Anthropic releases Claude Opus 4.6",
            event_type: "development",
            announced_at: "2026-02-06",
          },
          {
            id: "opus-vulnerabilities",
            title: "Anthropic reports Claude Opus 4.6 found over 500 high-severity vulnerabilities",
            event_type: "development",
            announced_at: "2026-02-12",
          },
        ],
      },
      {
        label: "Claude Code",
        events: [
          {
            id: "claude-md",
            title: "Karpathy-inspired CLAUDE.md file for Claude Code",
            event_type: "development",
            announced_at: "2026-04-13",
          },
          {
            id: "routines",
            title: "Anthropic launches Claude Code Routines",
            event_type: "development",
            announced_at: "2026-04-15",
          },
        ],
      },
      {
        label: "iOS 27",
        events: [
          {
            id: "airpods",
            title: "Apple AirPods settings redesign in iOS 27",
            event_type: "development",
            announced_at: "2026-05-26",
          },
          {
            id: "siri",
            title: "Reported iOS 27 Siri redesign",
            event_type: "development",
            announced_at: "2026-05-29",
          },
        ],
      },
    ];

    for (const testCase of cases) {
      expect(__testables.groupEventCandidates({
        events: testCase.events,
        cohortByEvent: new Map(
          testCase.events.map((event) => [event.id, "measurement" as const]),
        ),
        principals: () => [{
          id: `principal-${testCase.label}`,
          strength: "strong" as const,
          label: testCase.label,
        }],
      })).toHaveLength(2);
    }
  });

  it("keeps a lower-similarity contract paraphrase when action detail corroborates it", () => {
    const events = [
      {
        id: "early-report",
        title: "SpaceX reported to win $2.29B Space Force LEO communications backbone award",
        event_type: "award",
        announced_at: "2026-05-27",
      },
      {
        id: "award-confirmed",
        title: "SpaceX wins contract for Space Force LEO communications backbone",
        event_type: "award",
        announced_at: "2026-06-01",
      },
    ];
    expect(__testables.groupEventCandidates({
      events,
      cohortByEvent: new Map(events.map((event) => [event.id, "measurement" as const])),
      principals: () => [{
        id: "space-data-network",
        strength: "strong" as const,
        label: "Space Data Network",
      }],
    })).toHaveLength(1);
  });

  it("keeps a directive separate from the downstream implementation", () => {
    const events = [
      {
        id: "directive",
        title: "US Commerce Department export-control directive on Anthropic models",
        event_type: "policy_regulation",
        announced_at: "2026-06-12",
      },
      {
        id: "implementation",
        title: "Anthropic shuts off access to Mythos 5 and Fable 5 models after U.S. export-control directive",
        event_type: "policy_regulation",
        announced_at: "2026-06-15",
      },
    ];
    expect(__testables.groupEventCandidates({
      events,
      cohortByEvent: new Map(events.map((event) => [event.id, "measurement" as const])),
      principals: () => [
        { id: "fable", strength: "strong" as const, label: "Fable 5" },
        { id: "mythos", strength: "strong" as const, label: "Mythos 5" },
      ],
    })).toHaveLength(2);
  });

  it("does not trust a copied evidence row shared by the same document", () => {
    const events = [
      {
        id: "canonical",
        title: "Microsoft Scout security rollout",
        event_type: "deployment",
        announced_at: "2026-07-10",
      },
      {
        id: "restored",
        title: "OpenAI introduces Lockdown Mode",
        event_type: "deployment",
        announced_at: "2026-07-11",
      },
    ];
    const groups = __testables.groupEventCandidates({
      events,
      cohortByEvent: new Map(events.map((event) => [event.id, "measurement" as const])),
      principals: () => [],
      exactEvidenceKeys: () => new Map([
        ["story:copied-by-old-merge", new Set(["same-document"])],
      ]),
    });

    expect(groups).toHaveLength(2);
  });

  it("prevents a transitive event from bridging unrelated groups", () => {
    const events = [
      {
        id: "alpha",
        title: "Alpha radar system contract award",
        event_type: "award",
        announced_at: "2026-07-10",
      },
      {
        id: "bridge",
        title: "Alpha radar and Bravo sonar contract award",
        event_type: "award",
        announced_at: "2026-07-10",
      },
      {
        id: "bravo",
        title: "Bravo sonar system contract award",
        event_type: "award",
        announced_at: "2026-07-10",
      },
    ];
    const principalByEvent = new Map([
      ["alpha", [{ id: "alpha", strength: "strong" as const }]],
      ["bridge", [
        { id: "alpha", strength: "strong" as const },
        { id: "bravo", strength: "strong" as const },
      ]],
      ["bravo", [{ id: "bravo", strength: "strong" as const }]],
    ]);
    const groups = __testables.groupEventCandidates({
      events,
      cohortByEvent: new Map(events.map((event) => [event.id, "measurement" as const])),
      principals: (eventId) => principalByEvent.get(eventId) ?? [],
    });

    expect(groups).toHaveLength(2);
    expect(groups.some((group) =>
      group.some((event) => event.id === "alpha") &&
      group.some((event) => event.id === "bravo")
    )).toBe(false);
  });

  it("builds a reversible membership plan without changing source events", () => {
    const events = [
      {
        id: "duplicate",
        cluster_id: "ingestion-duplicate",
        review_status: "unreviewed",
        title: "Canada awards C-UAS contract",
        event_type: "award",
        announced_at: "2026-07-10",
        confidence: 0.9,
      },
      {
        id: "canonical",
        cluster_id: "ingestion-canonical",
        review_status: "confirmed",
        title: "Canada awards C-UAS contract",
        event_type: "award",
        announced_at: "2026-07-11",
        confidence: 0.8,
      },
    ];
    const original = structuredClone(events);
    const plans = __testables.buildEventClusterPlans({
      groups: [[
        ...events,
      ]],
      cohortByEvent: new Map([
        ["duplicate", "measurement" as const],
        ["canonical", "measurement" as const],
      ]),
      principal: () => "c-uas-programme",
      evidenceByEvent: new Map([
        ["duplicate", [
          { event_id: "duplicate", document_id: "document-a" },
        ]],
        ["canonical", [
          { event_id: "canonical", document_id: "document-a" },
          { event_id: "canonical", document_id: "document-b" },
        ]],
      ]),
    });

    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      canonicalId: "canonical",
      cohort: "measurement",
      memberCount: 2,
      members: [
        {
          eventId: "duplicate",
          relationship: "member",
          matchMetadata: { ingestion_cluster_id: "ingestion-duplicate" },
        },
        {
          eventId: "canonical",
          relationship: "canonical",
          matchMetadata: { ingestion_cluster_id: "ingestion-canonical" },
        },
      ],
    });
    expect(events).toEqual(original);
    expect(plans[0]).not.toHaveProperty("duplicateIds");
    expect(plans[0]).not.toHaveProperty("evidenceRows");
    expect(plans[0]).not.toHaveProperty("conceptRows");
    expect(plans[0]).not.toHaveProperty("entityRows");
  });

  it("selects the same canonical event regardless of database row order", () => {
    const earlier = {
      id: "event-z",
      title: "Canada awards C-UAS contract",
      event_type: "award",
      announced_at: "2026-07-10",
      confidence: 0.8,
    };
    const later = {
      id: "event-a",
      title: "Canada awards C-UAS contract",
      event_type: "award",
      announced_at: "2026-07-11",
      confidence: 0.8,
    };
    const build = (group: Array<Record<string, unknown>>) =>
      __testables.buildEventClusterPlans({
        groups: [group],
        cohortByEvent: new Map([
          ["event-z", "measurement" as const],
          ["event-a", "measurement" as const],
        ]),
        principal: () => "c-uas-programme",
        evidenceByEvent: new Map([
          ["event-z", [{ event_id: "event-z", document_id: "document-z" }]],
          ["event-a", [{ event_id: "event-a", document_id: "document-a" }]],
        ]),
      })[0];

    const forward = build([earlier, later]);
    const reversed = build([later, earlier]);
    expect(forward.canonicalId).toBe("event-z");
    expect(reversed.canonicalId).toBe(forward.canonicalId);
    expect(reversed.fingerprint).toBe(forward.fingerprint);
  });

  it("bounds event writes and stops scheduling after a failed batch", async () => {
    let active = 0;
    let maximumActive = 0;
    const results = await __testables.runInConcurrentBatches(
      [1, 2, 3, 4, 5, 6, 7],
      3,
      async (value) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active -= 1;
        return value * 2;
      },
    );
    expect(maximumActive).toBe(3);
    expect(results).toEqual([2, 4, 6, 8, 10, 12, 14]);

    const visited: number[] = [];
    let failureActive = 0;
    await expect(__testables.runInConcurrentBatches(
      [1, 2, 3, 4],
      2,
      async (value) => {
        visited.push(value);
        failureActive += 1;
        try {
          await new Promise((resolve) => setTimeout(resolve, value === 2 ? 1 : 3));
          if (value === 2) throw new Error("write failed");
          return value;
        } finally {
          failureActive -= 1;
        }
      },
    )).rejects.toThrow("write failed");
    expect(visited).toEqual([1, 2]);
    expect(failureActive).toBe(0);
  });
});
