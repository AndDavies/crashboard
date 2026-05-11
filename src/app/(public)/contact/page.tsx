import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/lib/marketing/site-config";
import { MarketingPageFrame } from "@/components/marketing/page-frame";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Contact",
  description: `Contact ${siteConfig.publicName}.`,
};

export default function ContactPage() {
  const mailto = `mailto:${siteConfig.email}?subject=Project%20inquiry`;

  return (
    <MarketingPageFrame>
      <p className="text-xs font-semibold text-muted-foreground uppercase">
        Contact
      </p>
      <h1 className="mt-4 max-w-3xl font-heading text-4xl font-semibold text-foreground md:text-5xl md:leading-[1.08]">
        Send context, not just a calendar ask.
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
        The most useful notes include the decision, the constraint, the timeline,
        and what you have already tried.
      </p>
      <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_minmax(0,22rem)] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>Email</CardTitle>
            <CardDescription>
              Best for introductions, project work, and useful exchanges.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <a
              href={mailto}
              className="text-base font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {siteConfig.email}
            </a>
            <Button
              nativeButton={false}
              render={<a href={mailto} />}
            >
              Open mail client
            </Button>
          </CardContent>
        </Card>
        <Card className="bg-muted/40">
          <CardHeader>
            <CardTitle className="text-base">Existing clients</CardTitle>
            <CardDescription>
              Access private notes, dashboards, and work surfaces.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              nativeButton={false}
              variant="outline"
              className="w-full"
              render={<Link href="/login" />}
            >
              Log in
            </Button>
          </CardContent>
        </Card>
      </div>
    </MarketingPageFrame>
  );
}
