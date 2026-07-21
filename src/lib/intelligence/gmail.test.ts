import { describe, expect, it } from "vitest";
import {
  gmailMessageToEnvelope,
  newsletterBackfillQuery,
} from "@/lib/intelligence/gmail";

describe("newsletterBackfillQuery", () => {
  it("uses the five child labels and an inclusive end date", () => {
    const query = newsletterBackfillQuery("2026-01-10", "2026-07-10");
    expect(query).toContain('label:"Newsletters/Business"');
    expect(query).toContain('label:"Newsletters/Cybersecurity"');
    expect(query).toContain('label:"Newsletters/Defence"');
    expect(query).toContain("after:2026/01/10");
    expect(query).toContain("before:2026/07/11");
    expect(query).toContain("-in:spam -in:trash");
  });
});

describe("gmailMessageToEnvelope", () => {
  it("extracts a plain-text MIME body and safe metadata", () => {
    const body = Buffer.from("Canada issued an RFI for a resilient communications trial.").toString(
      "base64url",
    );
    const envelope = gmailMessageToEnvelope(
      {
        id: "gmail-1",
        threadId: "thread-1",
        labelIds: ["Label_Business"],
        internalDate: String(Date.UTC(2026, 6, 10)),
        payload: {
          mimeType: "text/plain",
          headers: [
            { name: "Subject", value: "Defence procurement update" },
            { name: "From", value: "Example Brief <brief@example.com>" },
          ],
          body: { data: body },
        },
      },
      "00000000-0000-0000-0000-000000000001",
    );

    expect(envelope.externalId).toBe("gmail-1");
    expect(envelope.publisherName).toBe("Example Brief");
    expect(envelope.contentText).toContain("resilient communications trial");
    expect(envelope.metadata?.sender_email).toBe("brief@example.com");
  });
});
