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
      <p className="text-sm text-muted-foreground">
        Signed in as{" "}
        <span className="font-medium text-foreground">
          {user?.email ?? "you"}
        </span>
        . Use the sidebar to open tools and projects — this hub stays private.
      </p>
      <section className="grid gap-4 rounded-xl border border-border/80 bg-muted/30 p-6 sm:grid-cols-2">
        <div className="space-y-1">
          <h2 className="text-sm font-medium text-foreground">Next steps</h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            <li>Connect Whoop or other APIs under their sections</li>
            <li>Add Supabase tables or Edge Functions for tool data</li>
            <li>Register new routes in{" "}
              <code className="rounded bg-background px-1 py-0.5 text-xs">
                src/lib/dashboard/nav-config.ts
              </code>
            </li>
          </ul>
        </div>
        <div className="flex flex-col justify-center gap-2">
          <Link
            href="/"
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            ← Public site
          </Link>
        </div>
      </section>
    </div>
  );
}
