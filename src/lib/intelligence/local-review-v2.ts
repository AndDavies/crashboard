export const LOCAL_REVIEW_SECTIONS = {
  "story-duplicates": {
    key: "duplicatePairs",
    allowedFields: ["sameStory", "reviewerNote"],
    requiredFields: ["sameStory"],
  },
  "event-duplicates": {
    key: "eventDuplicatePairs",
    allowedFields: ["sameEvent", "reviewerNote"],
    requiredFields: ["sameEvent"],
  },
  segmentations: {
    key: "segmentationExamples",
    allowedFields: [
      "acceptable",
      "correctEditorialItemCount",
      "containsTrendEligibleBoilerplate",
      "reviewerNote",
    ],
    requiredFields: [
      "acceptable",
      "correctEditorialItemCount",
      "containsTrendEligibleBoilerplate",
    ],
  },
  "event-topic-links": {
    key: "eventTopicLinks",
    allowedFields: ["correctLink", "reviewerNote"],
    requiredFields: ["correctLink"],
  },
} as const;

export type LocalReviewSection = keyof typeof LOCAL_REVIEW_SECTIONS;

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The retained evaluation must be a JSON object.");
  }
  return value as JsonObject;
}

function itemsForSection(review: unknown, section: LocalReviewSection) {
  const value = object(review)[LOCAL_REVIEW_SECTIONS[section].key];
  if (!Array.isArray(value)) {
    throw new Error(
      `The retained evaluation is missing ${LOCAL_REVIEW_SECTIONS[section].key}.`,
    );
  }
  return value.map((item) => object(item));
}

function itemId(item: JsonObject) {
  const id = String(item.id ?? "").trim();
  if (!id) throw new Error("Every local review item must have a stable id.");
  return id;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  const candidate = value as JsonObject;
  return Object.fromEntries(
    Object.keys(candidate)
      .sort((left, right) => left.localeCompare(right, "en-CA"))
      .map((key) => [key, canonical(candidate[key])]),
  );
}

function withoutAllowedTargetFields(
  review: unknown,
  section: LocalReviewSection,
  selectedIds: Set<string>,
) {
  const clone = JSON.parse(JSON.stringify(review)) as JsonObject;
  const definition = LOCAL_REVIEW_SECTIONS[section];
  const items = itemsForSection(clone, section);
  for (const item of items) {
    if (!selectedIds.has(itemId(item))) continue;
    for (const field of definition.allowedFields) delete item[field];
  }
  return canonical(clone);
}

function assertBooleanOrNull(item: JsonObject, field: string, id: string) {
  const value = item[field];
  if (value !== null && typeof value !== "boolean") {
    throw new Error(`${id}.${field} must be true, false, or null.`);
  }
}

function assertReviewerValues(
  item: JsonObject,
  section: LocalReviewSection,
) {
  const id = itemId(item);
  const note = item.reviewerNote;
  if (typeof note !== "string" || note.length > 500) {
    throw new Error(`${id}.reviewerNote must be a string of at most 500 characters.`);
  }

  if (section === "story-duplicates") {
    assertBooleanOrNull(item, "sameStory", id);
    if (item.sameStory !== true && !note.trim()) {
      throw new Error(`${id}.reviewerNote is required for a false or null decision.`);
    }
  } else if (section === "event-duplicates") {
    assertBooleanOrNull(item, "sameEvent", id);
    if (item.sameEvent !== true && !note.trim()) {
      throw new Error(`${id}.reviewerNote is required for a false or null decision.`);
    }
  } else if (section === "event-topic-links") {
    assertBooleanOrNull(item, "correctLink", id);
    if (item.correctLink !== true && !note.trim()) {
      throw new Error(`${id}.reviewerNote is required for a false or null decision.`);
    }
  } else {
    assertBooleanOrNull(item, "acceptable", id);
    assertBooleanOrNull(item, "containsTrendEligibleBoilerplate", id);
    const count = item.correctEditorialItemCount;
    if (count !== null && (!Number.isInteger(count) || Number(count) < 0)) {
      throw new Error(
        `${id}.correctEditorialItemCount must be a non-negative integer or null.`,
      );
    }
    if (
      (item.acceptable !== true ||
        item.containsTrendEligibleBoilerplate !== true ||
        count === null) &&
      !note.trim()
    ) {
      throw new Error(`${id}.reviewerNote is required for a false or null decision.`);
    }
  }
}

function pick(candidate: JsonObject, keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, candidate[key]]));
}

export function blindedLocalReviewItems(
  review: unknown,
  section: LocalReviewSection,
  targetIds: string[],
) {
  const selected = new Set(targetIds);
  const items = itemsForSection(review, section).filter((item) =>
    selected.has(itemId(item))
  );
  if (items.length !== selected.size) {
    throw new Error("One or more local review targets are missing from review.json.");
  }
  return items.map((item) => {
    const id = itemId(item);
    if (section === "story-duplicates") {
      return {
        id,
        left: pick(object(item.left), ["title", "excerpt", "publishedAt", "sourceUrl"]),
        right: pick(object(item.right), ["title", "excerpt", "publishedAt", "sourceUrl"]),
      };
    }
    if (section === "event-duplicates") {
      return {
        id,
        left: pick(object(item.left), ["title", "summary", "eventType", "eventDate"]),
        right: pick(object(item.right), ["title", "summary", "eventType", "eventDate"]),
      };
    }
    if (section === "event-topic-links") {
      return pick(item, ["id", "eventTitle", "eventSummary", "eventType", "topicLabel"]);
    }
    const segments = Array.isArray(item.segments)
      ? item.segments.map((segment) =>
        pick(object(segment), ["id", "type", "title", "excerpt", "excludedBecause"])
      )
      : [];
    return {
      ...pick(item, ["id", "documentTitle", "sourceText"]),
      segments,
    };
  });
}

export function unresolvedLocalReviewItemIds(
  review: unknown,
  section: LocalReviewSection,
  limit: number,
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new Error("Local review batch size must be an integer from 1 through 20.");
  }
  const definition = LOCAL_REVIEW_SECTIONS[section];
  const ids = new Set<string>();
  const selected: string[] = [];
  for (const item of itemsForSection(review, section)) {
    const id = itemId(item);
    if (ids.has(id)) throw new Error(`Duplicate local review item id: ${id}.`);
    ids.add(id);
    const unresolved = definition.requiredFields.some((field) => item[field] == null);
    const alreadyExplained = String(item.reviewerNote ?? "").trim().length > 0;
    if (unresolved && !alreadyExplained && selected.length < limit) selected.push(id);
  }
  return selected;
}

export function assertAllowedLocalReviewMutation(
  before: unknown,
  after: unknown,
  section: LocalReviewSection,
  targetIds: string[],
) {
  const selectedIds = new Set(targetIds);
  if (!selectedIds.size || selectedIds.size !== targetIds.length) {
    throw new Error("Local review requires a non-empty set of unique target IDs.");
  }

  const beforeItems = new Map(
    itemsForSection(before, section).map((item) => [itemId(item), item]),
  );
  const afterItems = new Map(
    itemsForSection(after, section).map((item) => [itemId(item), item]),
  );
  for (const id of selectedIds) {
    if (!beforeItems.has(id) || !afterItems.has(id)) {
      throw new Error(`Local review target ${id} is missing before or after review.`);
    }
    assertReviewerValues(afterItems.get(id)!, section);
  }

  const beforeProtected = JSON.stringify(
    withoutAllowedTargetFields(before, section, selectedIds),
  );
  const afterProtected = JSON.stringify(
    withoutAllowedTargetFields(after, section, selectedIds),
  );
  if (beforeProtected !== afterProtected) {
    throw new Error(
      "The local reviewer changed protected evidence, another item, or another section.",
    );
  }
}

export function mergeLocalReviewDecisions(
  before: unknown,
  section: LocalReviewSection,
  targetIds: string[],
  decisions: unknown,
) {
  if (!Array.isArray(decisions)) {
    throw new Error("Local review output must contain a decisions array.");
  }
  const definition = LOCAL_REVIEW_SECTIONS[section];
  const targetSet = new Set(targetIds);
  if (decisions.length !== targetSet.size) {
    throw new Error("Local review output must contain exactly one decision per target.");
  }
  const decisionMap = new Map<string, JsonObject>();
  const allowedKeys = new Set(["id", ...definition.allowedFields]);
  for (const value of decisions) {
    const decision = object(value);
    const id = itemId(decision);
    if (!targetSet.has(id) || decisionMap.has(id)) {
      throw new Error(`Local review output contains an unexpected or duplicate ID: ${id}.`);
    }
    const keys = Object.keys(decision);
    if (
      keys.some((key) => !allowedKeys.has(key)) ||
      [...allowedKeys].some((key) => !(key in decision))
    ) {
      throw new Error(`Local review output for ${id} has missing or extra fields.`);
    }
    decisionMap.set(id, decision);
  }

  const after = JSON.parse(JSON.stringify(before)) as JsonObject;
  for (const item of itemsForSection(after, section)) {
    const decision = decisionMap.get(itemId(item));
    if (!decision) continue;
    for (const field of definition.allowedFields) item[field] = decision[field];
  }
  assertAllowedLocalReviewMutation(before, after, section, targetIds);
  return after;
}

export function localReviewProgress(review: unknown, section: LocalReviewSection) {
  const definition = LOCAL_REVIEW_SECTIONS[section];
  const items = itemsForSection(review, section);
  const unresolved = items.filter((item) =>
    definition.requiredFields.some((field) => item[field] == null)
  ).length;
  return {
    total: items.length,
    reviewed: items.length - unresolved,
    unresolved,
  };
}
