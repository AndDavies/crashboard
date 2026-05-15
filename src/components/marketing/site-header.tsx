import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { siteConfig } from "@/lib/marketing/site-config";
import { Button } from "@/components/ui/button";
import { MobileNav, type NavItem } from "@/components/marketing/mobile-nav";

const mainNav: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/blog", label: "Blog" },
  { href: "/wiki", label: "Wiki" },
  { href: "/about", label: "About" },
];

export async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const signedIn = Boolean(user);

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
        <Link
          href="/"
          className="group font-heading text-[15px] font-medium text-foreground outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring"
        >
          {siteConfig.publicName}
          <span className="ml-2 hidden font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase sm:inline">
            {siteConfig.brandWordmark}
          </span>
          <span className="mt-1 block h-0.5 w-14 bg-accent transition-[width] group-hover:w-20" />
        </Link>

        <nav
          className="hidden items-center gap-0.5 md:flex"
          aria-label="Primary"
        >
          {mainNav.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {signedIn ? (
            <Button
              nativeButton={false}
              render={<Link href="/dashboard" />}
              size="sm"
              className="hidden rounded-full bg-foreground px-4 text-background hover:bg-foreground/85 sm:inline-flex"
            >
              Dashboard
            </Button>
          ) : (
            <Button
              nativeButton={false}
              render={<Link href="/login" />}
              variant="outline"
              size="sm"
              className="hidden rounded-full border-foreground/15 bg-background px-4 text-foreground hover:border-foreground/30 hover:bg-muted sm:inline-flex"
            >
              Dashboard
            </Button>
          )}
          <MobileNav
            links={mainNav}
            signedIn={signedIn}
            brandWordmark={siteConfig.brandWordmark}
          />
        </div>
      </div>
    </header>
  );
}
