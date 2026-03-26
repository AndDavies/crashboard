function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export type KnowledgebaseSourceLink = {
  href: string;
  label: string;
  kind: "drive_open" | "canonical" | "original";
};

export function getKnowledgebasePreferredSourceLink(input: {
  originalUrl: string;
  canonicalUrl: string | null;
  metadata?: Record<string, unknown> | null;
}): KnowledgebaseSourceLink {
  const metadata = asRecord(input.metadata);
  const driveOpenUrl = asString(metadata.drive_open_url);
  if (driveOpenUrl) {
    return {
      href: driveOpenUrl,
      label: "Open in Drive",
      kind: "drive_open",
    };
  }

  if (input.canonicalUrl?.trim()) {
    return {
      href: input.canonicalUrl,
      label: "Original source",
      kind: "canonical",
    };
  }

  return {
    href: input.originalUrl,
    label: "Original source",
    kind: "original",
  };
}

export function getKnowledgebaseAlternateSourceLink(input: {
  originalUrl: string;
  canonicalUrl: string | null;
  metadata?: Record<string, unknown> | null;
}): KnowledgebaseSourceLink | null {
  const preferred = getKnowledgebasePreferredSourceLink(input);
  if (preferred.kind === "drive_open") {
    const driveDownloadUrl = asString(asRecord(input.metadata).drive_download_url);
    if (driveDownloadUrl) {
      return {
        href: driveDownloadUrl,
        label: "Direct PDF URL",
        kind: "original",
      };
    }
    return {
      href: input.originalUrl,
      label: "Source URL",
      kind: "original",
    };
  }

  if (input.canonicalUrl && input.canonicalUrl !== input.originalUrl) {
    return {
      href: input.originalUrl,
      label: "Original URL",
      kind: "original",
    };
  }

  return null;
}
