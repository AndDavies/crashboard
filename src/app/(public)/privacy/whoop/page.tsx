import type { Metadata } from "next";
import { MarketingPageFrame } from "@/components/marketing/page-frame";
import { siteConfig } from "@/lib/marketing/site-config";
import { Separator } from "@/components/ui/separator";
import { canonicalUrl } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "Privacy Policy — WHOOP integration",
  description:
    "How Crashboard collects, uses, and protects WHOOP-related data when you connect your WHOOP account.",
  robots: { index: true, follow: true },
  alternates: { canonical: canonicalUrl("/privacy/whoop") },
};

export default function WhoopPrivacyPolicyPage() {
  const effectiveDate = "March 21, 2026";
  const operator = siteConfig.publicName;
  const product = siteConfig.brandWordmark;

  return (
    <MarketingPageFrame>
      <p className="text-xs font-semibold text-muted-foreground uppercase">
        Legal
      </p>
      <h1 className="mt-3 font-heading text-3xl font-semibold text-foreground md:text-4xl">
        Privacy Policy — WHOOP
      </h1>
      <p className="mt-4 max-w-2xl text-sm text-muted-foreground">
        Effective date: {effectiveDate}
      </p>
      <Separator className="my-10 max-w-md" />

      <article className="max-w-3xl space-y-10 text-sm leading-relaxed text-muted-foreground">
        <section className="space-y-3">
          <h2 className="font-heading text-base font-semibold text-foreground">
            1. Introduction
          </h2>
          <p>
            This Privacy Policy describes how {operator} (“we,” “us,” or “our”)
            handles information when you use {product} (the “Service”) and choose
            to connect or integrate your WHOOP account through our WHOOP
            developer integration (the “WHOOP Integration”). It is intended to
            meet common requirements for applications registered in the WHOOP
            developer environment.
          </p>
          <p>
            WHOOP is a separate company. Their handling of your data is governed
            by WHOOP’s own policies. We encourage you to review WHOOP’s privacy
            documentation on{" "}
            <a
              href="https://www.whoop.com"
              className="font-medium text-foreground underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              whoop.com
            </a>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-heading text-base font-semibold text-foreground">
            2. Information we collect
          </h2>
          <p>
            When you authorize the WHOOP Integration, we may access and process
            categories of health, fitness, and account-related data made
            available to us through the WHOOP API, depending on the permissions
            you grant. This may include, for example:
          </p>
          <ul className="list-inside list-disc space-y-2 pl-1">
            <li>
              Profile or account identifiers needed to link your WHOOP account
              to the Service
            </li>
            <li>
              Activity, recovery, sleep, strain, or similar metrics and
              summaries exposed by WHOOP for authorized applications
            </li>
            <li>
              Technical data such as API tokens, connection timestamps, and error
              logs needed to operate the integration securely
            </li>
          </ul>
          <p>
            We do not use the WHOOP Integration to collect information from WHOOP
            beyond what you authorize through WHOOP’s consent and OAuth (or
            successor) flows.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-heading text-base font-semibold text-foreground">
            3. How we use information
          </h2>
          <p>We use WHOOP-related information solely to:</p>
          <ul className="list-inside list-disc space-y-2 pl-1">
            <li>Provide, maintain, and improve features you request</li>
            <li>Authenticate and secure your connection to WHOOP</li>
            <li>Debug, monitor reliability, and prevent abuse or fraud</li>
            <li>Comply with applicable law and enforce our terms</li>
          </ul>
          <p>
            We do not sell your personal information. We do not use WHOOP data
            for third-party advertising or profiling unrelated to operating the
            Service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-heading text-base font-semibold text-foreground">
            4. Legal bases (where applicable)
          </h2>
          <p>
            If laws such as the UK or EU GDPR apply, we rely on one or more of:
            (a) performance of a contract with you, (b) your consent where
            required for health-related or sensitive processing, and/or (c) our
            legitimate interests in providing a secure, reliable service,
            balanced against your rights.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-heading text-base font-semibold text-foreground">
            5. Sharing and subprocessors
          </h2>
          <p>We may share information only as needed with:</p>
          <ul className="list-inside list-disc space-y-2 pl-1">
            <li>
              <span className="text-foreground">WHOOP</span>, to the extent
              required for the integration to function
            </li>
            <li>
              <span className="text-foreground">Service providers</span> that
              host, store, or process data on our behalf (for example,
              infrastructure, authentication, or database providers), under
              contracts that require appropriate safeguards
            </li>
            <li>
              <span className="text-foreground">Authorities</span> if required by
              law or to protect rights, safety, and security
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-heading text-base font-semibold text-foreground">
            6. Retention
          </h2>
          <p>
            We retain WHOOP-related data only as long as needed to provide the
            Service, meet legal obligations, resolve disputes, and enforce our
            agreements. When you disconnect WHOOP or delete your account, we
            will delete or anonymize associated data within a reasonable period,
            except where law requires longer retention.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-heading text-base font-semibold text-foreground">
            7. Security
          </h2>
          <p>
            We implement reasonable technical and organizational measures
            designed to protect information against unauthorized access, loss,
            or alteration. No method of transmission or storage is completely
            secure; we cannot guarantee absolute security.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-heading text-base font-semibold text-foreground">
            8. Your choices and rights
          </h2>
          <p>Depending on your location, you may have the right to:</p>
          <ul className="list-inside list-disc space-y-2 pl-1">
            <li>Access, correct, or delete certain personal information</li>
            <li>Restrict or object to certain processing</li>
            <li>Withdraw consent where processing is consent-based</li>
            <li>Port data where applicable</li>
            <li>Lodge a complaint with a supervisory authority</li>
          </ul>
          <p>
            You can revoke the Service’s access to your WHOOP account at any
            time through WHOOP’s account or developer authorization settings and
            through any disconnect option we provide in the Service. Revoking
            access may limit or disable WHOOP-related features.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-heading text-base font-semibold text-foreground">
            9. International transfers
          </h2>
          <p>
            We may process and store information in countries other than your
            own. Where required, we use appropriate safeguards (such as
            standard contractual clauses) for cross-border transfers.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-heading text-base font-semibold text-foreground">
            10. Children
          </h2>
          <p>
            The Service is not directed to children under 13 (or the minimum age
            required in your jurisdiction). We do not knowingly collect
            personal information from children.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-heading text-base font-semibold text-foreground">
            11. Changes
          </h2>
          <p>
            We may update this Privacy Policy from time to time. We will post the
            updated version on this page and revise the effective date. Material
            changes may be communicated through the Service or other reasonable
            means where appropriate.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-heading text-base font-semibold text-foreground">
            12. Contact
          </h2>
          <p>
            For privacy questions or requests regarding this policy or the WHOOP
            Integration, use the contact method configured for this deployment.
          </p>
        </section>
      </article>
    </MarketingPageFrame>
  );
}
