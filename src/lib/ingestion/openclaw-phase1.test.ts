import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { __testables } from "@/lib/ingestion/openclaw-phase1";

describe("openclaw phase 1 YouTube helpers", () => {
  it("detects YouTube hosts", () => {
    expect(__testables.isYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    expect(__testables.isYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?t=42")).toBe(true);
    expect(__testables.isYouTubeUrl("https://example.com/article")).toBe(false);
  });

  it("extracts video ids from common YouTube URL formats", () => {
    expect(__testables.extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&ab_channel=test")).toBe("dQw4w9WgXcQ");
    expect(__testables.extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=42")).toBe("dQw4w9WgXcQ");
    expect(__testables.extractYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(__testables.extractYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
});

describe("openclaw phase 1 X helpers", () => {
  it("detects X/Twitter post URLs", () => {
    expect(__testables.isXPostUrl("https://x.com/jack/status/20")).toBe(true);
    expect(__testables.isXPostUrl("https://twitter.com/jack/status/20?s=20")).toBe(true);
    expect(__testables.isXPostUrl("https://x.com/home")).toBe(false);
    expect(__testables.isXPostUrl("https://example.com/jack/status/20")).toBe(false);
  });

  it("extracts X/Twitter post ids from common URL formats", () => {
    expect(__testables.extractXPostId("https://x.com/jack/status/20")).toBe("20");
    expect(__testables.extractXPostId("https://twitter.com/jack/status/20?s=20")).toBe("20");
    expect(__testables.extractXPostId("https://x.com/i/status/20")).toBe("20");
  });

  it("extracts readable X post text from metadata", () => {
    const dom = new JSDOM(`<!doctype html><html><head>
      <meta name="twitter:description" content='Andrew on X: "Shipping the new ingestion path today." / X'>
      <title>Andrew on X: "Shipping the new ingestion path today."</title>
    </head><body></body></html>`);

    expect(__testables.extractXPostText(dom.window.document)).toBe(
      "Shipping the new ingestion path today.",
    );
  });
});
