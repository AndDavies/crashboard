import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { writingItems } from "@/lib/marketing/site-config";
import { SectionShell, SectionHeading } from "@/components/marketing/section-shell";

export function WritingSection() {
  return (
    <SectionShell id="writing" className="bg-[#f4f0e8]">
      <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div>
          <SectionHeading
            eyebrow="Writing"
            title="Essays, notes, and reference material with a clear place to land."
            description="Essays, field notes, and references can sit together without flattening into one long undifferentiated feed."
          />
          <div className="relative aspect-[4/3] overflow-hidden border border-foreground/10">
            <Image
              src="/images/marketing/crashboard-writing.png"
              alt="Editorial desk with research notes and writing materials"
              fill
              sizes="(min-width: 1024px) 40vw, 100vw"
              className="object-cover"
            />
          </div>
        </div>

        <div className="divide-y divide-foreground/12 border-y border-foreground/12">
          {writingItems.map((post) => (
            <Link
              key={post.title}
              href={post.href ?? "/blog"}
              className="group grid gap-4 py-6 outline-none transition-colors hover:bg-background/35 focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[10rem_1fr_auto]"
            >
              <div className="text-xs font-semibold uppercase text-muted-foreground">
                {post.section}
              </div>
              <div>
                <h3 className="font-heading text-lg font-semibold text-foreground">
                  {post.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {post.description}
                </p>
              </div>
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                {post.status}
                <ArrowRightIcon
                  className="mt-0.5 size-4 transition-transform group-hover:translate-x-1"
                  aria-hidden
                />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}
