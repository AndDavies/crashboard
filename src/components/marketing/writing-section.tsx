import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { blogPosts } from "@/lib/marketing/site-config";
import { SectionShell, SectionHeading } from "@/components/marketing/section-shell";

export function WritingSection() {
  const hasPosts = blogPosts.length > 0;

  return (
    <SectionShell id="writing" className="bg-[#f4f0e8]">
      <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div>
          <SectionHeading
            eyebrow="Blog"
            title="The next content surface is the blog."
            description="This section points to the scaffold that the CMS will populate once publishing is connected."
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

        <div className="border-y border-foreground/12 py-8">
          {hasPosts ? (
            <div className="divide-y divide-foreground/12">
              {blogPosts.map((post) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="group grid gap-4 py-6 outline-none transition-colors hover:bg-background/35 focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[1fr_auto]"
                >
                  <div>
                    <h3 className="font-heading text-lg font-semibold text-foreground">
                      {post.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {post.description}
                    </p>
                  </div>
                  <ArrowRightIcon
                    className="mt-1 size-4 text-muted-foreground transition-transform group-hover:translate-x-1"
                    aria-hidden
                  />
                </Link>
              ))}
            </div>
          ) : (
            <div className="max-w-xl">
              <p className="text-sm font-semibold uppercase text-muted-foreground">
                Awaiting CMS content
              </p>
              <h3 className="mt-3 font-heading text-2xl font-semibold text-foreground">
                Blog posts will appear here once they exist.
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                The route and data shape are ready for dynamic posts. Until the
                CMS is added, the public site should direct readers to the wiki
                instead of listing draft titles as public content.
              </p>
              <Link
                href="/blog"
                className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-foreground underline-offset-4 hover:underline"
              >
                Review the blog scaffold
                <ArrowRightIcon className="size-4" aria-hidden />
              </Link>
            </div>
          )}
        </div>
      </div>
    </SectionShell>
  );
}
