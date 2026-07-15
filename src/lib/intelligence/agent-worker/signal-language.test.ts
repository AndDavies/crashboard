import { describe, expect, it } from "vitest";
import {
  auditSignalLabels,
  extractSignalObservations,
  isBlockedSignalLabel,
  isObviousBoilerplateDocument,
} from "./signal-language";

describe("signal language quality gates", () => {
  it("blocks calendar, interface, boilerplate, and generic editorial words", () => {
    for (const label of ["July", "Judgment", "Browser", "Target", "Due", "Investment", "TechCrunch", "S-1", "From the Web", "Top News"]) {
      expect(isBlockedSignalLabel(label), label).toBe(true);
    }
    for (const label of ["C-UAS", "F-35", "NATO", "AI coding tools", "Private credit"]) {
      expect(isBlockedSignalLabel(label), label).toBe(false);
    }
  });

  it("excludes wrapper segments without excluding real dated headlines", () => {
    expect(isObviousBoilerplateDocument("Subscribe", "Subscribe to receive the latest issue.")).toBe(true);
    expect(isObviousBoilerplateDocument("From the Web", "A collection of links and newsletter navigation.")).toBe(true);
    expect(isObviousBoilerplateDocument(
      "July 14 - GigaWiper lets threat actors choose destructive attacks",
      "Researchers documented a destructive cyberattack capability affecting enterprise systems.",
    )).toBe(false);
  });

  it("extracts stable topics, organizations, systems, programmes, and phrases", () => {
    const observations = [...extractSignalObservations(
      "NATO accelerates C-UAS procurement as CMMC requirements change",
      "Alliance members are testing counter-drone systems while the Department of Defense reviews CMMC implementation.",
    ).values()];
    expect(observations.some((item) => item.kind === "topic" && item.label === "Counter-drone defence")).toBe(true);
    expect(observations.some((item) => item.kind === "organization" && item.label === "NATO")).toBe(true);
    expect(observations.some((item) => item.kind === "system" && item.label === "C-UAS")).toBe(true);
    expect(observations.some((item) => item.kind === "programme" && item.label === "CMMC")).toBe(true);
    expect(observations.some((item) => item.kind === "keyword" && item.label.includes("procurement"))).toBe(true);
  });

  it("reports blocked labels as a failed quality rate", () => {
    const audit = auditSignalLabels([
      { label: "July", kind: "keyword" },
      { label: "C-UAS", kind: "system" },
      { label: "NATO", kind: "organization" },
    ]);
    expect(audit.blocked.map((item) => item.label)).toEqual(["July"]);
    expect(audit.meaningfulRate).toBeCloseTo(2 / 3);
  });
});
