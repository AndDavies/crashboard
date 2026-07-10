import { load } from "cheerio";

export type BlogArticleHeading = {
  id: string;
  level: 2 | 3;
  text: string;
};

function slugifyHeading(input: string) {
  return input
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";
}

function normalizedText(input: string) {
  return input.replace(/\s+/g, " ").trim().toLowerCase();
}

export function prepareBlogArticleHtml(
  html: string,
  options: { answerSummary?: string } = {},
) {
  const $ = load(html, null, false);
  const summary = normalizedText(options.answerSummary ?? "");

  if (summary) {
    $("p").each((_, element) => {
      if (normalizedText($(element).text()) === summary) {
        $(element).remove();
        return false;
      }
    });
  }

  const usedIds = new Set<string>();
  const headings: BlogArticleHeading[] = [];

  $("h2, h3").each((_, element) => {
    const heading = $(element);
    const text = heading.text().replace(/\s+/g, " ").trim();
    if (!text) return;

    const base = slugifyHeading(heading.attr("id") || text);
    let id = base;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    heading.attr("id", id);
    heading.addClass("scroll-mt-24");
    headings.push({
      id,
      level: element.tagName.toLowerCase() === "h2" ? 2 : 3,
      text,
    });
  });

  return {
    html: $.root().html() ?? "",
    headings,
  };
}
