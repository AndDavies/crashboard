# SEO, AEO, and Google Tracking Setup

Crashboard is wired for a lightweight Google measurement stack without hardcoded
production IDs. The site can run with direct GA4 tracking, Google Tag Manager, or
only Search Console verification.

## Environment Variables

Set these in Vercel project settings for production.

```env
NEXT_PUBLIC_GOOGLE_ANALYTICS_ID=G-XXXXXXXXXX
NEXT_PUBLIC_GOOGLE_TAG_MANAGER_ID=GTM-XXXXXXX
NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=search-console-verification-token
NEXT_PUBLIC_GOOGLE_CONSENT_DEFAULT=denied
```

Use either direct GA4 or GTM as the primary collection path:

- `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID` loads direct `gtag.js`.
- `NEXT_PUBLIC_GOOGLE_TAG_MANAGER_ID` loads GTM. If GTM is set, the app does not
  also load direct `gtag.js`, which avoids duplicate page views.
- `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` renders the Search Console verification
  meta tag.
- `NEXT_PUBLIC_GOOGLE_CONSENT_DEFAULT=denied` enables the built-in consent banner.
  Use `granted` only if you intentionally want analytics enabled by default.

## Current Instrumentation

- Public routes only load Google tracking. Dashboard and auth utility surfaces do
  not load the analytics tags.
- Initial and client-side route transitions emit manual `page_view` events.
- Internal blog/wiki navigation emits `select_content`.
- Outbound links emit `click` with `outbound: true`.
- Public file links emit `file_download`.
- Consent Mode defaults advertising storage to denied. Analytics storage follows
  `NEXT_PUBLIC_GOOGLE_CONSENT_DEFAULT` and the visitor's saved choice.

## GA4 Setup Checklist

1. Create a GA4 property and web data stream for `https://crashboard.dev`.
2. Copy the web stream Measurement ID into `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID`, or
   create a GTM container and put the Measurement ID inside GTM instead.
3. In GA4 Enhanced Measurement, keep page views enabled only if you are relying on
   automatic browser-history tracking. This app already sends manual page views.
4. Mark useful learning events as key events only when they represent intent:
   `select_content` for article/wiki interest, `file_download` for downloads, and
   any future newsletter/contact events.
5. Use GA4 DebugView after deployment to confirm `page_view`, `select_content`,
   outbound `click`, and `file_download` events.

## Search Console Checklist

1. Add a URL-prefix property for `https://crashboard.dev`.
2. Choose the HTML tag method and copy only the `content` value into
   `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`.
3. Deploy, then verify that the homepage source contains
   `google-site-verification`.
4. Submit `https://crashboard.dev/sitemap.xml`.

## SEO/AEO Publishing Workflow

Use the Blog CMS as the publishing checkpoint for answer-shaped content.

1. Start from a CMS starter draft when the post maps to a wiki cluster.
2. Keep one clear question per post.
3. Fill the answer summary before publishing; it should be the paragraph a
   reader or answer system can safely quote in summary.
4. Add a focus topic, tags, related wiki slugs, and at least one internal link
   in the body.
5. Publish only when the post has a real title, clean slug, body content, and a
   public reason to exist. SEO/AEO warnings are advisory, not hard blockers.

Current priority answer targets:

- What is an AI automation builder?
- How should personal knowledge systems support AI workflows?
- What makes agent memory useful?
- How should AI workflows separate rules from judgment?
- What is source-backed research in an AI workflow?

## Monitoring Cadence

Review this monthly while the site is still a learning exercise.

- Search Console: indexed pages, sitemap status, crawl errors, and queries that
  actually show impressions.
- GA4: blog/wiki page views, `select_content` events, outbound clicks, and
  whether readers move from wiki pages into related blog posts.
- Content quality: pages with impressions but low engagement should get clearer
  titles, stronger summaries, and better internal links before adding more posts.
- Technical health: rerun `npm run build`, fetch `/robots.txt` and
  `/sitemap.xml`, and spot-check one blog post plus one wiki page for structured
  data after larger content releases.

## Tracking Policy

Keep the analytics model simple:

- Measure whether public pages are discovered and read.
- Track navigation patterns across blog and wiki clusters.
- Do not send search queries, email addresses, user IDs, or CMS draft content.
- Avoid running both direct GA4 and GTM GA4 tags at the same time.
- Treat analytics as feedback for content clarity, not as a reason to inflate
  copy or chase low-quality traffic.

## Reference Guidance

- Google Analytics: manual page views with `send_page_view: false`.
- Google Analytics: recommended events such as `select_content`.
- Google Analytics: enhanced measurement events and duplicate-page-view caution.
- Google Search Console: HTML tag ownership verification.
- Google Tag Manager: install one web container across public pages.
