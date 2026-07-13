export type NewsletterBoilerplateReason =
  | "footer_boilerplate"
  | "navigation_boilerplate"
  | "sponsored_content";

const CLEAR_FOOTER_PATTERN =
  /(?:\bwrapping up\b|\bhave questions, comments, or feedback\b|\bjust reply directly\b|\b(?:we would|we'd|i would|i'd) love to hear from you\b)/iu;

const CLEAR_PROMOTION_PATTERN =
  /(?:\b(?:sponsored|advertisement|paid placement|partner content|presented by|from our sponsor)\b|\bsecure your spot\b|\bput your brand in front of\b|\badvertising solutions\b|\bcatch our upcoming (?:research )?webinars\b|\bsign up for [^.!?]{0,100}\b(?:daily|newsletter|email series|webinar)\b)/iu;

const MARKETING_REGISTRATION_PATTERN =
  /\bregister (?:today|now)\b(?=[\s\S]{0,180}\b(?:annual (?:conference|gathering)|conference|webinar|executive breakfast|networking sessions?|tickets?)\b)/iu;

const RECURRING_REGISTRATION_PATTERN = /\bregister (?:today|now)\b/iu;

const CLEAR_NAVIGATION_PATTERN =
  /\bwelcome to (?:the )?(?:latest|this) edition of\b/iu;

/**
 * Deliberately narrow phrases that identify newsletter chrome or direct calls
 * to action. General words such as "event", "registration", and "system" are
 * not enough on their own, so recurring editorial headlines remain eligible.
 */
export function clearNewsletterBoilerplateReason(
  title: string | null | undefined,
  contentText: string | null | undefined,
): NewsletterBoilerplateReason | null {
  const combined = `${title ?? ""} ${contentText ?? ""}`;
  if (
    CLEAR_PROMOTION_PATTERN.test(combined) ||
    MARKETING_REGISTRATION_PATTERN.test(combined)
  ) return "sponsored_content";
  if (CLEAR_FOOTER_PATTERN.test(combined)) return "footer_boilerplate";
  if (CLEAR_NAVIGATION_PATTERN.test(combined)) return "navigation_boilerplate";
  return null;
}

export function isRecurringNewsletterBoilerplate(
  title: string | null | undefined,
  contentText: string | null | undefined,
) {
  return clearNewsletterBoilerplateReason(title, contentText) !== null ||
    RECURRING_REGISTRATION_PATTERN.test(`${title ?? ""} ${contentText ?? ""}`);
}
