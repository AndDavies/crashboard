export const BLOG_IMAGE_FORMATS = [
  {
    id: "cover",
    label: "Cover / social image",
    dimensions: "1200 x 630 px",
    ratio: "1.91:1",
    use: "Use for the post cover, Open Graph, Twitter large card, sitemap images, and link previews.",
  },
  {
    id: "inline-wide",
    label: "Inline wide image",
    dimensions: "1200 x 675 px",
    ratio: "16:9",
    use: "Use for diagrams, source maps, screenshots, and section breaks inside the article body.",
  },
  {
    id: "inline-square",
    label: "Inline square image",
    dimensions: "1080 x 1080 px",
    ratio: "1:1",
    use: "Use sparingly for compact concept cards or shareable supporting visuals.",
  },
] as const;

export const BLOG_IMAGE_STYLE_RULES = [
  "Use a Ruck Race League-inspired visual language: gritty, athletic, tactical, and field-shot rather than polished SaaS.",
  "Build around high-contrast black-and-white photography, film grain, harsh texture, deep shadows, blown highlights, and documentary energy.",
  "Use a single yellow-gold accent, close to hazard tape, race bibs, lightning marks, or field signage.",
  "Favor rucks, boots, gravel, mud, flags, maps, bib numbers, timing gear, taped documents, field notebooks, and rough outdoor surfaces.",
  "Keep typography, if present, bold, condensed, uppercase, and poster-like, but avoid readable factual claims inside generated images.",
  "Avoid copying Ruck Race League logos, skulls, lightning marks, or protected brand assets; borrow the mood, not the identity.",
  "Avoid glossy robots, neon sci-fi, floating UI panels, cartoon styles, generic stock-office imagery, soft gradients, bokeh, and decorative orbs.",
] as const;

export const BLOG_IMAGE_PROMPT_TEMPLATE = `Create a Crashboard blog image.

Format: [cover 1200 x 630 px | inline-wide 1200 x 675 px | inline-square 1080 x 1080 px]
Post title: [title]
Focus topic: [topic]
Core idea to visualize: [one sentence]
Objects or scene: [3-5 concrete objects, tools, documents, or environments]

Style:
Ruck Race League-inspired Crashboard editorial style. Gritty, athletic, tactical, field-shot, and high-trust. Use high-contrast black-and-white photography, film grain, harsh texture, deep shadows, blown highlights, weathered outdoor surfaces, rucks, boots, gravel, mud, flags, maps, bib numbers, timing gear, taped documents, field notebooks, and rough tactical materials. Use one yellow-gold accent, close to hazard tape, race bibs, field signage, or a sharp mark. Make the image feel like field intelligence, endurance, pressure, and real-world work rather than polished SaaS marketing.

Composition:
Leave negative space for cropping. Keep the focal subject centered or slightly right of center. Strong silhouettes and diagonal motion are welcome. If typography appears, make it bold, condensed, uppercase, and poster-like, but avoid readable factual claims. The image should work as a serious editorial cover and still remain clear at social-card thumbnail size.

Avoid:
Do not copy Ruck Race League logos, skulls, lightning marks, or protected brand assets. Avoid fake logos, brand marks, glossy robots, neon sci-fi, floating UI panels, cartoon styles, generic stock-office imagery, soft gradients, bokeh, decorative orbs, and dense text.`;
