export const BLOG_IMAGE_FORMATS = [
  {
    id: "cover",
    label: "Cover / social image",
    promptLabel: "cover",
    dimensions: "1200 x 630 px",
    ratio: "1.91:1",
    use: "Use for the post cover, Open Graph, Twitter large card, sitemap images, and link previews.",
    promptUse:
      "post cover, Open Graph, Twitter large card, sitemap image, and link previews",
  },
  {
    id: "inline-wide",
    label: "Inline wide image",
    promptLabel: "inline-wide",
    dimensions: "1200 x 675 px",
    ratio: "16:9",
    use: "Use for diagrams, source maps, screenshots, and section breaks inside the article body.",
    promptUse:
      "wide article-body image, diagram, source map, screenshot, or section break",
  },
  {
    id: "inline-square",
    label: "Inline square image",
    promptLabel: "inline-square",
    dimensions: "1080 x 1080 px",
    ratio: "1:1",
    use: "Use sparingly for compact concept cards or shareable supporting visuals.",
    promptUse: "compact concept card or supporting share image",
  },
] as const;

export type BlogImageFormatId = (typeof BLOG_IMAGE_FORMATS)[number]["id"];

export const BLOG_IMAGE_PALETTE = [
  { name: "warm off-white", hex: "#FAF9F6" },
  { name: "card white", hex: "#FEFDFC" },
  { name: "near-black", hex: "#060709" },
  { name: "paper gray", hex: "#ECEBE8" },
  { name: "border gray", hex: "#CCCAC6" },
  { name: "muted slate", hex: "#4A4D51" },
  { name: "Crashboard acid-lime accent", hex: "#E5FC00" },
] as const;

export const BLOG_IMAGE_APPROVED_OBJECTS = [
  "field notebooks",
  "printed reports",
  "index cards",
  "taped documents",
  "access checklists",
  "marked folders",
  "source packets",
  "cables",
  "labels",
  "keyboards",
  "terminal printouts",
  "black tape",
  "translucent tape",
  "acid-lime tape edges",
  "small registration marks",
  "network cables",
  "adapters",
  "desk edges",
  "cable ties",
  "photocopied pages",
  "paper clips",
  "asphalt",
  "concrete",
  "scuffed desk surfaces",
] as const;

export const BLOG_IMAGE_STYLE_RULES = [
  "Use 55-75% warm off-white, card white, near-black, or monochrome structure; 20-40% gray paper, concrete, asphalt, photocopy, or shadow texture; and only 2-6% acid-lime accent.",
  "Use warm off-white #FAF9F6, card white #FEFDFC, near-black #060709, paper gray #ECEBE8, border gray #CCCAC6, muted slate #4A4D51, and Crashboard acid-lime accent #E5FC00.",
  "Build around minimalist street/Bauhaus editorial structure: spare geometry, asymmetric grids, hard rules, paper stacks, black tape, photocopy grain, concrete or asphalt texture, cables, and source-document artifacts.",
  "Favor field notebooks, printed reports, index cards, taped documents, access checklists, marked folders, source packets, cables, labels, keyboards, terminal printouts, concrete, asphalt, and scuffed desk surfaces.",
  "Use a full-bleed minimalist composition with large negative space, one clear focal cluster centered or slightly right, strong simple diagonals or grid rules, and crop-safe social framing.",
  "If text is requested, render the exact text only as a short restrained poster line in sans or mono type; do not invent extra claims.",
  "The mood is serious, source-backed, operational, urban, and editorial: a public notebook artifact or street-poster field note, not polished SaaS marketing.",
  "Avoid action-event aesthetics, numbered event props, skulls, lightning marks, fake logos, brand marks, glossy robots, neon sci-fi, floating UI panels, cartoon styles, generic stock-office imagery, soft gradients, bokeh, decorative orbs, broad accent-color fields, dense text, and watermarks.",
] as const;

export const BLOG_IMAGE_PROMPT_TEMPLATE = `Create a Crashboard blog image.

Format: [cover 1200 x 630 px | inline-wide 1200 x 675 px | inline-square 1080 x 1080 px]
Post title: [title]
Focus topic: [topic]
Core idea to visualize: [one sentence]
Objects or scene: [3-5 concrete objects, tools, documents, or environments]

Style:
Crashboard minimalist street/Bauhaus editorial style, aligned to the website palette. Use warm background #FAF9F6, card white #FEFDFC, near-black #060709, paper gray #ECEBE8, border gray #CCCAC6, muted slate #4A4D51, and exact Crashboard acid-lime accent #E5FC00. Use spare documentary artifacts, photocopy grain, hard shadows, black tape, paper stacks, cables, concrete/asphalt texture, and clean asymmetric grid structure. Keep the acid-lime accent to 2-6% of the image as a rule, tape edge, registration mark, sticker, or underline. Do not use broad accent-color backgrounds.

Composition:
Full-bleed minimalist editorial cover with large negative space, one clear focal cluster centered or slightly right, strong simple diagonals or grid rules, and thumbnail-safe contrast. Use Bauhaus discipline through blocks, circles, rules, and hard crops only when they support the physical artifact scene.

Avoid:
No action-event aesthetics, numbered event props, skulls, lightning marks, fake logos, brand marks, glossy robots, neon sci-fi, floating UI panels, cartoons, generic stock-office imagery, soft gradients, bokeh, decorative orbs, dense text, or watermarks.`;

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
    : ["field notebook", "index cards", "printed report", "black tape"];
}

export function buildBlogImagePrompt(input: BlogImagePromptInput) {
  const format = getFormat(input.format);
  const title = cleanText(input.title, "Untitled Crashboard post");
  const topic = cleanText(input.topic, "source-backed AI workflow systems");
  const idea = cleanText(input.idea, "Operational research under pressure");
  const objects = cleanObjects(input.objects);
  const displayText = input.text?.trim();
  const textLine = displayText
    ? `Text, if included: "${displayText}" exactly. Render it as a short, restrained poster line in sans or mono type; do not add other text.`
    : "Text: no readable body text; abstract marks, rules, labels, or texture only unless short display text is explicitly requested.";

  return `Use case: photorealistic-editorial
Asset type: Crashboard blog ${format.promptUse}
Primary request: Create a Crashboard blog image.
Format: ${format.promptLabel}, ${format.dimensions}, ${format.ratio}
Post title: ${title}
Focus topic: ${topic}
Core idea to visualize: ${idea}
Objects or scene: ${objects.join(", ")}

Style/medium:
Crashboard minimalist street/Bauhaus editorial style aligned to the website palette. Use warm off-white #FAF9F6, card white #FEFDFC, near-black #060709, paper gray #ECEBE8, border gray #CCCAC6, muted slate #4A4D51, and the exact Crashboard acid-lime accent #E5FC00. Use sparse documentary artifacts, photocopy grain, halftone noise, hard shadows, black tape, paper stacks, cables, concrete/asphalt texture, scuffed desk surfaces, and clean asymmetric grid structure. Keep the acid-lime accent to 2-6% of the image as a thin rule, tape edge, sticker, registration mark, small label, underline, or one compact block. Do not use broad accent-color backgrounds. Make the image feel like a public notebook artifact, street poster, or source-backed operating record rather than polished SaaS marketing.

Composition/framing:
Full-bleed minimalist editorial composition with crop-safe negative space. Keep one clear focal cluster centered or slightly right of center. Use flat-lay or close-detail framing, strong simple diagonals from tape/cables/document edges, Bauhaus grid discipline, hard rules, blocks, circles, and high thumbnail contrast. Keep the scene sparse and legible, not busy or action-oriented.

${textLine}

Constraints:
No action-event aesthetics, numbered event props, skulls, lightning marks, fake logos, brand marks, glossy robots, neon sci-fi, floating UI panels, cartoon style, generic stock-office imagery, soft gradients, bokeh, decorative orbs, broad accent-color fields, dense text, and no watermark.`;
}
