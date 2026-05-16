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

export type BlogImageFormatId = (typeof BLOG_IMAGE_FORMATS)[number]["id"];

export const BLOG_IMAGE_PALETTE = [
  { name: "near-black", hex: "#050505" },
  { name: "carbon black", hex: "#191916" },
  { name: "charcoal", hex: "#2A2A26" },
  { name: "dirty white", hex: "#F2F0E8" },
  { name: "hard white", hex: "#FFFFFF" },
  { name: "smoke gray", hex: "#B8B8B2" },
  { name: "field gray", hex: "#66665F" },
  { name: "race gold", hex: "#F7C600" },
  { name: "hot yellow", hex: "#FFD600" },
  { name: "dark gold", hex: "#BFA100" },
] as const;

export const BLOG_IMAGE_APPROVED_OBJECTS = [
  "rucks",
  "boots",
  "gravel",
  "mud",
  "flags",
  "maps",
  "bib numbers",
  "timing chips",
  "stopwatches",
  "taped documents",
  "field notebooks",
  "printed reports",
  "index cards",
  "cables",
  "headlamps",
  "asphalt",
  "concrete",
  "rain",
  "rough outdoor surfaces",
] as const;

export const BLOG_IMAGE_STYLE_RULES = [
  "Use 70-85% black, charcoal, or monochrome image area, 10-25% white or dirty white, and only 3-8% yellow-gold accent. Never use broad yellow backgrounds.",
  "Use near-black #050505, carbon black #191916, charcoal #2A2A26, dirty white #F2F0E8, hard white #FFFFFF, smoke gray #B8B8B2, field gray #66665F, race gold #F7C600, hot yellow #FFD600, and dark gold #BFA100.",
  "Build around black-and-white documentary field photography: high contrast, visible grain, harsh texture, crushed shadows, blown highlights, light motion blur, weather, sweat, dust, mud, tape, and scuffed surfaces.",
  "Favor rucks, boots, gravel, mud, flags, maps, bib numbers, timing chips, stopwatches, taped documents, field notebooks, printed reports, index cards, cables, headlamps, asphalt, concrete, rain, and rough outdoor surfaces.",
  "Use full-bleed low-angle or close field-detail framing, strong diagonals, centered or slightly right focal subjects, and enough negative space for cover and social crops.",
  "If text is requested, use short bold condensed uppercase poster lettering in hard white or race gold; do not invent long readable claims inside generated images.",
  "The mood is endurance, pressure, field intelligence, operational work, and source-backed research under physical strain, not clean SaaS illustration.",
  "Do not copy Ruck Race League names, logos, skulls, lightning marks, slogans, or protected brand assets. Borrow mood and production language only.",
  "Avoid fake logos, brand marks, glossy robots, neon sci-fi, floating UI panels, cartoon styles, generic stock-office imagery, soft gradients, bokeh, decorative orbs, and dense text.",
] as const;

export const BLOG_IMAGE_PROMPT_TEMPLATE = `Create a Crashboard blog image.

Format: [cover 1200 x 630 px | inline-wide 1200 x 675 px | inline-square 1080 x 1080 px]
Post title: [title]
Focus topic: [topic]
Core idea to visualize: [one sentence]
Objects or scene: [3-5 concrete objects, tools, documents, or environments]

Style:
Crashboard editorial style borrowing only the mood and production language of gritty endurance-race field media. Use near-black #050505, carbon black #191916, charcoal #2A2A26, dirty white #F2F0E8, hard white #FFFFFF, smoke gray #B8B8B2, field gray #66665F, race gold #F7C600, hot yellow #FFD600, and dark gold #BFA100. Keep 70-85% of the image black, charcoal, or monochrome, 10-25% white or dirty white, and only 3-8% yellow-gold accent. Do not use broad yellow backgrounds.

Photography:
Black-and-white documentary field photography, high contrast, visible grain, harsh texture, crushed shadows, blown highlights, light motion blur, weather, sweat, dust, mud, tape, and scuffed surfaces. Make the image feel like field intelligence, endurance, pressure, operational work, and serious source-backed research under physical strain rather than polished SaaS marketing.

Composition:
Full-bleed low-angle or close field-detail framing. Use strong diagonals, centered or slightly right focal subject, and clear negative space for crop safety. If typography appears, make it short, bold, condensed, uppercase, and poster-like in hard white or race gold. The image should work as a serious editorial cover and still remain clear at social-card thumbnail size.

Avoid:
Do not copy Ruck Race League names, logos, skulls, lightning marks, slogans, or protected brand assets. Avoid fake logos, brand marks, glossy robots, neon sci-fi, floating UI panels, cartoon styles, generic stock-office imagery, soft gradients, bokeh, decorative orbs, broad yellow backgrounds, and dense text.`;

export type BlogImagePromptInput = {
  format: BlogImageFormatId;
  title: string;
  topic: string;
  idea: string;
  objects: string[];
  text?: string;
};

function getFormat(format: BlogImageFormatId) {
  return BLOG_IMAGE_FORMATS.find((item) => item.id === format) ?? BLOG_IMAGE_FORMATS[0];
}

function cleanText(input: string, fallback: string) {
  const normalized = input.replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function cleanObjects(objects: string[]) {
  const cleaned = objects
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 5);

  return cleaned.length > 0
    ? cleaned
    : ["ruck", "field notebook", "taped map", "timing tag"];
}

export function buildBlogImagePrompt(input: BlogImagePromptInput) {
  const format = getFormat(input.format);
  const title = cleanText(input.title, "Untitled Crashboard post");
  const topic = cleanText(input.topic, "source-backed AI workflow systems");
  const idea = cleanText(input.idea, "Operational research under pressure");
  const objects = cleanObjects(input.objects);
  const displayText = input.text?.trim();

  return `Create a Crashboard blog image.

Format: ${format.label} - ${format.dimensions}, ${format.ratio}.
Use: ${format.use}
Post title: ${title}
Focus topic: ${topic}
Core idea to visualize: ${idea}
Objects or scene: ${objects.join(", ")}
Display text: ${displayText ? `"${displayText}"` : "none by default; only use short abstract marks if needed"}

Style:
Crashboard editorial style borrowing only the mood and production language of gritty endurance-race field media. Use near-black #050505, carbon black #191916, charcoal #2A2A26, dirty white #F2F0E8, hard white #FFFFFF, smoke gray #B8B8B2, field gray #66665F, race gold #F7C600, hot yellow #FFD600, and dark gold #BFA100. Keep 70-85% of the image black, charcoal, or monochrome, 10-25% white or dirty white, and only 3-8% yellow-gold accent. Do not use broad yellow backgrounds.

Photography:
Black-and-white documentary field photography, high contrast, visible grain, harsh texture, crushed shadows, blown highlights, light motion blur, weather, sweat, dust, mud, tape, and scuffed surfaces.

Objects:
Favor rucks, boots, gravel, mud, flags, maps, bib numbers, timing chips, stopwatches, taped documents, field notebooks, printed reports, index cards, cables, headlamps, asphalt, concrete, rain, and rough outdoor surfaces.

Composition:
Full-bleed low-angle or close field-detail framing. Use strong diagonals, centered or slightly right focal subject, and clear negative space for crop safety. No soft hero-card composition. If typography appears, make it short, bold, condensed, uppercase, and poster-like in hard white or race gold. The image must remain clear at social-card thumbnail size.

Mood:
Endurance, pressure, field intelligence, operational work, and serious source-backed research under physical strain. It should feel like a field report, not a clean SaaS illustration.

Identity boundary:
Do not copy Ruck Race League names, logos, skulls, lightning marks, slogans, or protected brand assets. Borrow mood and production language only.

Avoid:
Fake logos, brand marks, glossy robots, neon sci-fi, floating UI panels, cartoon styles, generic stock-office imagery, soft gradients, bokeh, decorative orbs, broad yellow backgrounds, and dense text.`;
}
