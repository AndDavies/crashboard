import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Dashboard · Crashboard",
  description: "Your private Crashboard dashboard.",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-foreground/70">
          Signed in as{" "}
          <span className="font-medium text-foreground">
            {user?.email ?? "you"}
          </span>
          . This area is only visible after Supabase authentication.
        </p>
      </div>
      <section className="grid gap-4 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-6 sm:grid-cols-2">
        <div className="space-y-1">
          <h2 className="text-sm font-medium text-foreground">Next steps</h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-foreground/65">
            <li>Add tables or Edge Functions for your private data</li>
            <li>Wire blog/articles to Supabase or MDX</li>
            <li>Customize this layout for your workflow</li>
          </ul>
        </div>
        <div className="flex flex-col justify-center gap-2">
          <Link
            href="/"
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            ← Back to public site
          </Link>
        </div>
      </section>
    </div>
  );
}
