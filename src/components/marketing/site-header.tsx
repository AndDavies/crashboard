import Link from "next/link";
import { siteConfig } from "@/lib/marketing/site-config";
import { MainNav } from "@/components/marketing/main-nav";
import { MobileNav, type NavItem } from "@/components/marketing/mobile-nav";

const mainNav: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/blog", label: "Blog" },
  { href: "/wiki", label: "Wiki" },
  { href: "/about", label: "About" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-foreground/80 bg-background/95 backdrop-blur-md">
      <div className="hidden border-b border-border/80 md:block">
        <div className="container-wide flex h-8 items-center justify-between">
          <p className="editorial-kicker">{siteConfig.brandWordmark} / Public research notebook</p>
          <p className="editorial-kicker">{siteConfig.location}</p>
        </div>
      </div>
      <div className="container-wide flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          className="group inline-flex items-baseline gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="font-heading text-2xl font-semibold leading-none text-foreground">
            {siteConfig.publicName}
          </span>
          <span className="hidden font-mono text-[10px] uppercase text-muted-foreground sm:inline">
            {siteConfig.brandWordmark}
          </span>
        </Link>

        <MainNav items={mainNav} />

        <div className="flex items-center gap-2">
          <Link
            href="/blog"
            className="hidden min-h-10 items-center border-l border-border/80 px-4 text-sm font-semibold text-foreground transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
          >
            Latest brief <span className="ml-2" aria-hidden>→</span>
          </Link>
          <MobileNav links={mainNav} brandWordmark={siteConfig.brandWordmark} />
        </div>
      </div>
    </header>
  );
}
