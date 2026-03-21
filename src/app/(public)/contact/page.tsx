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
      <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
        Contact
      </p>
      <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
        Let’s work together
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
        Share a short brief: problem, timeline, and how you’ll measure
        success. I typically reply within a few business days.
      </p>
      <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_minmax(0,22rem)] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>Email</CardTitle>
            <CardDescription>
              Best for introductions and project inquiries.
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
              Access your private dashboard — same Supabase session as before.
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
