import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { siteConfig } from "@/lib/marketing/site-config";
import { Button } from "@/components/ui/button";
import { MobileNav, type NavItem } from "@/components/marketing/mobile-nav";

const mainNav: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/work", label: "Work" },
  { href: "/blog", label: "Writing" },
  { href: "/contact", label: "Contact" },
];

export async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const signedIn = Boolean(user);

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
        <Link
          href="/"
          className="font-heading text-sm font-semibold tracking-tight text-foreground outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring"
        >
          {siteConfig.publicName}
          <span className="ml-1.5 font-normal text-muted-foreground">
            · {siteConfig.brandWordmark}
          </span>
        </Link>

        <nav
          className="hidden items-center gap-0.5 md:flex"
          aria-label="Primary"
        >
          {mainNav.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              className="hidden sm:inline-flex"
            >
              Dashboard
            </Button>
          ) : (
            <Button
              nativeButton={false}
              render={<Link href="/login" />}
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
            >
              Log in
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
