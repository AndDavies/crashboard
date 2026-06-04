"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

export type NavItem = { href: string; label: string };

type Props = {
  links: NavItem[];
  signedIn: boolean;
  brandWordmark: string;
};

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileNav({ links, signedIn, brandWordmark }: Props) {
  const pathname = usePathname();
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open menu"
          >
            <MenuIcon className="size-5" aria-hidden />
          </Button>
        }
      />
      <SheetContent side="right" className="w-[min(100%,20rem)]">
        <SheetHeader>
          <SheetTitle className="eyebrow text-left text-foreground">
            {brandWordmark}
          </SheetTitle>
        </SheetHeader>
        <nav
          className="grid gap-px border border-border/80 bg-border/80"
          aria-label="Mobile"
        >
          {links.map(({ href, label }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center border-l-2 px-4 py-3 text-sm font-medium outline-none motion-safe:transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  active
                    ? "border-l-accent bg-card font-semibold text-foreground"
                    : "border-l-transparent bg-card/70 text-muted-foreground hover:bg-card hover:text-foreground focus-visible:bg-card",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <Separator className="my-4" />
        <div className="flex flex-col gap-2">
          {signedIn ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center border border-foreground bg-foreground px-4 py-2.5 text-sm font-medium text-background motion-safe:transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center justify-center border border-foreground bg-foreground px-4 py-2.5 text-sm font-medium text-background motion-safe:transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Log in
            </Link>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
