import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const nav = [
  { href: "/content", label: "Content" },
  { href: "/blog", label: "Blog" },
  { href: "/articles", label: "Articles" },
  { href: "/links", label: "Links" },
] as const;

export async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="border-b border-foreground/10 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-foreground"
        >
          Crashboard
        </Link>
        <nav className="flex flex-1 items-center justify-center gap-1 sm:gap-4">
          {nav.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="rounded-md px-2 py-1.5 text-sm text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="shrink-0">
          {user ? (
            <Link
              href="/dashboard"
              className="rounded-full bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              href="/login"
              className="rounded-full border border-foreground/15 px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
