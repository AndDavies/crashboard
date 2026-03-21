"use client";

import Link from "next/link";
import { MenuIcon } from "lucide-react";
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

export function MobileNav({ links, signedIn, brandWordmark }: Props) {
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
          <SheetTitle className="text-left">{brandWordmark}</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 pt-2" aria-label="Mobile">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              {label}
            </Link>
          ))}
        </nav>
        <Separator className="my-4" />
        <div className="flex flex-col gap-2">
          {signedIn ? (
            <Button render={<Link href="/dashboard" />} nativeButton={false}>
              Dashboard
            </Button>
          ) : (
            <Button render={<Link href="/login" />} nativeButton={false}>
              Log in
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
