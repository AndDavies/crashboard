const BLOCKED_HOSTS = new Set([
  "facebook.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "gstatic.com",
  "instagram.com",
  "linkedin.com",
  "mail.google.com",
  "twitter.com",
  "x.com",
]);

const BLOCKED_HOST_FRAGMENTS = [
  "doubleclick",
  "google-analytics",
  "list-manage.com",
  "mailchimp.com",
  "mandrillapp.com",
  "sendgrid.net",
  "tracking",
] as const;

const BLOCKED_PATH_PATTERN =
  /(?:^|[\/_-])(unsubscribe|preferences|manage[-_ ]?subscription|email[-_ ]?settings|privacy|tracking|pixel)(?:[\/_-]|$)/iu;
const ASSET_PATTERN = /\.(?:avif|css|gif|ico|jpe?g|js|png|svg|webp|woff2?)(?:$|[?#])/iu;

function registrableHost(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./u, "");
}

function unwrapTrackedUrl(value: string) {
  let current = value.replace(/&amp;/giu, "&").trim();
  for (let depth = 0; depth < 2; depth += 1) {
    try {
      const parsed = new URL(current);
      const candidate = ["url", "u", "target", "redirect", "redirect_url", "destination"]
        .map((key) => parsed.searchParams.get(key))
        .find((entry) => entry?.startsWith("http://") || entry?.startsWith("https://"));
      if (!candidate) return parsed.toString();
      current = decodeURIComponent(candidate);
    } catch {
      return current;
    }
  }
  return current;
}

export function normalizeSourceUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(unwrapTrackedUrl(value));
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(?:utm_|mc_|mkt_|vero_|oly_|ref$|source$|campaign$)/iu.test(key)) {
        parsed.searchParams.delete(key);
      }
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function sourceUrlHost(value: string | null | undefined) {
  const normalized = normalizeSourceUrl(value);
  if (!normalized) return null;
  return registrableHost(new URL(normalized).hostname);
}

export function isTrustworthyContentUrl(value: string | null | undefined) {
  const normalized = normalizeSourceUrl(value);
  if (!normalized || ASSET_PATTERN.test(normalized)) return false;
  const parsed = new URL(normalized);
  const host = registrableHost(parsed.hostname);
  if (BLOCKED_HOSTS.has(host)) return false;
  if (BLOCKED_HOST_FRAGMENTS.some((fragment) => host.includes(fragment))) return false;
  if (BLOCKED_PATH_PATTERN.test(`${parsed.pathname}${parsed.search}`)) return false;
  return true;
}

export function extractHttpLinks(value: string) {
  const matches = [
    ...value.matchAll(/(?:href=["']|\()(https?:\/\/[^"')\s<>]+)["')]/giu),
  ];
  return [
    ...new Set(
      matches
        .map((match) => normalizeSourceUrl(match[1]))
        .filter((link): link is string => Boolean(link)),
    ),
  ].slice(0, 200);
}

export function chooseCanonicalSourceUrl(links: string[]) {
  return links.find((link) => isTrustworthyContentUrl(link)) ?? null;
}

export const __testables = {
  unwrapTrackedUrl,
};
