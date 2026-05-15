import Link from "next/link";
import { siteConfig } from "@/lib/marketing/site-config";
import { Separator } from "@/components/ui/separator";

const footerNav = [
  { href: "/", label: "Home" },
  { href: "/blog", label: "Blog" },
  { href: "/wiki", label: "Wiki" },
  { href: "/about", label: "About" },
] as const;

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/80 bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="font-heading text-sm font-semibold text-foreground">
              {siteConfig.publicName}
            </p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              {siteConfig.shortBio}
            </p>
          </div>
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-6 gap-y-2">
              {footerNav.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/dashboard"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Dashboard
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <Separator className="my-8" />
        <p className="text-xs text-muted-foreground">
          © {year} {siteConfig.publicName}. {siteConfig.brandWordmark}.
        </p>
      </div>
    </footer>
  );
}
