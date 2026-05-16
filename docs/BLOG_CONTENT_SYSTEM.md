# Blog Content System

This is the working standard for generating Crashboard blog posts and images.

## CMS Route

Primary route: `/dashboard/content/blog/new`

The Add New Post editor currently supports the core SEO/AEO fields needed for useful public posts:

- Post title and slug.
- Excerpt for public listing copy.
- Rich text body with headings, lists, links, blockquotes, code blocks, and inline images.
- Cover image upload.
- SEO title.
- Meta description.
- Canonical URL override.
- Noindex toggle.
- Focus topic.
- Tags.
- Answer summary for the public "Short answer" block.
- Source links.
- Related wiki slugs.
- Draft, scheduled, published, archived, preview, and revision workflows.

Public blog posts use those fields in:

- Dynamic page metadata and canonical URLs.
- Open Graph and Twitter large-card metadata.
- BlogPosting structured data.
- Sitemap image references.
- Public article page sections for short answer, sources, related wiki pages, and related posts.

## Known Gaps

These are not blockers for publishing, but they are the next SEO/image upgrades if the blog grows:

- Cover images do not yet have stored alt text. Treat covers as decorative, or add `cover_image_alt` before using images that carry unique factual meaning.
- Inline image alt text defaults to the uploaded file name. Rename image files clearly before uploading, or add an editable inline-image alt control later.
- The database supports a separate `og_image_path`, but the editor currently defaults the social image to the cover image instead of exposing a separate upload control.
- There is no automated image-size validation. Generate at the target dimensions before upload.

## Image Formats

| Use | Dimensions | Ratio | Notes |
| --- | ---: | ---: | --- |
| Cover / social image | 1200 x 630 px | 1.91:1 | Use for post covers, Open Graph, Twitter large cards, sitemap images, and link previews. |
| Inline wide image | 1200 x 675 px | 16:9 | Use for diagrams, source maps, screenshots, and section breaks inside the article body. |
| Inline square image | 1080 x 1080 px | 1:1 | Use sparingly for compact concept cards or shareable supporting visuals. |

## Visual Style

Crashboard blog images should borrow the energy of Ruck Race League's brand style without copying its protected marks. The useful cues are gritty athletic photography, black-and-white field texture, hard contrast, condensed uppercase energy, and a yellow-gold accent.

Use:

- Gritty, athletic, tactical, field-shot compositions.
- High-contrast black-and-white photography, film grain, harsh texture, deep shadows, and blown highlights.
- One yellow-gold accent close to hazard tape, race bibs, field signage, or a sharp mark.
- Rucks, boots, gravel, mud, flags, maps, bib numbers, timing gear, taped documents, field notebooks, and rough outdoor surfaces.
- Bold, condensed, uppercase, poster-like typography when typography is useful.
- Negative space so the image survives social-card cropping and thumbnail views.

Avoid:

- Readable body text.
- Ruck Race League logos, skulls, lightning marks, or protected brand assets.
- Fake logos or brand marks.
- Glossy robots, neon sci-fi, floating UI panels, cartoon styles, generic stock-office imagery, soft gradients, bokeh, and decorative orbs.

## Reusable Image Prompt

```text
Create a Crashboard blog image.

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
Do not copy Ruck Race League logos, skulls, lightning marks, or protected brand assets. Avoid fake logos, brand marks, glossy robots, neon sci-fi, floating UI panels, cartoon styles, generic stock-office imagery, soft gradients, bokeh, decorative orbs, and dense text.
```

## Publishing Checklist

Before publishing:

- Title is clear and human-readable.
- Slug is lowercase and hyphenated.
- Excerpt explains the post in plain language.
- SEO title is either customized or the post title is already search-friendly.
- Meta description is concise and specific.
- Answer summary states the direct answer or thesis.
- Focus topic and tags match the actual topic.
- Body includes at least one relevant internal link or source link.
- Source links are added when the post depends on external evidence.
- Related wiki slugs are added when the post extends the public wiki.
- Cover image is generated at 1200 x 630 px.
