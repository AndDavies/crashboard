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
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
        <Link
          href="/"
          className="group font-heading text-[15px] font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {siteConfig.publicName}
          <span className="ml-2 hidden font-mono text-[10px] uppercase text-muted-foreground sm:inline">
            {siteConfig.brandWordmark}
          </span>
          <span className="mt-1 block h-0.5 w-14 bg-accent motion-safe:transition-[width] motion-safe:group-hover:w-20" />
        </Link>

        <MainNav items={mainNav} />

        <div className="flex items-center gap-2">
          <Link
            href="/blog"
            className="hidden border border-foreground bg-foreground px-4 py-1.5 text-sm font-medium text-background motion-safe:transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
          >
            Latest brief
          </Link>
          <MobileNav links={mainNav} brandWordmark={siteConfig.brandWordmark} />
        </div>
      </div>
    </header>
  );
}
