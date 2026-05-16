"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics/events";

const DOWNLOAD_EXTENSIONS = /\.(csv|docx?|pdf|pptx?|xlsx?|zip)$/i;

function cleanText(input: string | null | undefined) {
  return input?.replace(/\s+/g, " ").trim().slice(0, 120) || undefined;
}

function contentTypeFromPath(pathname: string) {
  if (pathname.startsWith("/blog/")) return "blog_post";
  if (pathname.startsWith("/wiki/")) return "wiki_page";
  if (pathname === "/blog" || pathname === "/wiki") return "content_hub";
  return null;
}

export function InteractionAnalytics() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;

      const target = event.target instanceof Element ? event.target : null;
      const link = target?.closest("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;

      const href = link.href;
      if (!href) return;

      const url = new URL(href, window.location.origin);
      const linkText = cleanText(link.textContent);

      if (DOWNLOAD_EXTENSIONS.test(url.pathname)) {
        trackEvent("file_download", {
          file_name: url.pathname.split("/").pop(),
          link_text: linkText,
          link_url: url.href,
        });
        return;
      }

      if (url.origin !== window.location.origin) {
        trackEvent("click", {
          link_domain: url.hostname,
          link_text: linkText,
          link_url: url.href,
          outbound: true,
        });
        return;
      }

      const contentType = contentTypeFromPath(url.pathname);
      if (contentType) {
        trackEvent("select_content", {
          content_type: contentType,
          item_id: url.pathname,
          link_text: linkText,
        });
      }
    }

    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

  return null;
}

