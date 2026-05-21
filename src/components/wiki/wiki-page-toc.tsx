"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Heading = {
  id: string;
  level: number;
  text: string;
};

export function WikiReadingProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    function updateProgress() {
      const article = document.querySelector<HTMLElement>("[data-wiki-article]");
      if (!article) return;
      const rect = article.getBoundingClientRect();
      const max = Math.max(rect.height - window.innerHeight, 1);
      const value = Math.min(1, Math.max(0, -rect.top / max));
      setProgress(value);
    }

    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);
    return () => {
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
    };
  }, []);

  return (
    <div className="fixed inset-x-0 top-0 z-50 h-0.5 bg-transparent" aria-hidden>
      <div
        className="h-full bg-accent motion-safe:transition-[width] motion-safe:duration-150 motion-safe:ease-out"
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  );
}

export function WikiPageToc({ headings }: { headings: Heading[] }) {
  const [activeId, setActiveId] = useState(headings[0]?.id ?? "");

  useEffect(() => {
    const elements = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((element): element is HTMLElement => Boolean(element));

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .toSorted((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const first = visible[0]?.target.id;
        if (first) setActiveId(first);
      },
      { rootMargin: "-18% 0px -70% 0px", threshold: [0, 1] },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [headings]);

  return (
    <nav
      className="scroll-mask mt-3 max-h-[22rem] space-y-0.5 overflow-y-auto pr-1"
      aria-label="Page table of contents"
    >
      {headings.map((heading) => (
        <a
          key={heading.id}
          href={`#${heading.id}`}
          aria-current={activeId === heading.id ? "location" : undefined}
          className={cn(
            "block border-l-2 py-1.5 pl-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            heading.level === 3 && "pl-6",
            activeId === heading.id
              ? "border-accent bg-muted/50 text-foreground"
              : "border-transparent text-muted-foreground hover:border-foreground/30 hover:text-foreground",
          )}
        >
          {heading.text}
        </a>
      ))}
    </nav>
  );
}
