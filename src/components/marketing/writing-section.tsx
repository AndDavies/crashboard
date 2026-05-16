import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { blogPosts } from "@/lib/marketing/site-config";
import { SectionShell, SectionHeading } from "@/components/marketing/section-shell";

export function WritingSection() {
  const hasPosts = blogPosts.length > 0;

  return (
    <SectionShell id="writing" className="bg-card">
      <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div>
          <SectionHeading
            eyebrow="Blog"
            title="The blog is for questions that need more than a note."
            description="Posts will connect field notes, source trails, and working examples back to the wiki."
          />
          <div className="technical-grid relative aspect-[4/3] overflow-hidden border-y border-foreground/10 bg-background">
            <Image
              src="/images/marketing/crashboard-writing.jpg"
              alt="Editorial desk with research notes and writing materials"
              fill
              sizes="(min-width: 1024px) 40vw, 100vw"
              className="object-cover opacity-70 grayscale"
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
                    <h3 className="font-heading text-xl font-light text-foreground">
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
              <h3 className="mt-3 font-heading text-3xl leading-tight font-light text-foreground">
                The archive starts when there is something worth publishing.
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Until the CMS is feeding real essays, this section stays quiet.
                The wiki already has the source-backed notes that future posts
                will build from.
              </p>
              <Link
                href="/blog"
                className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-foreground underline-offset-4 hover:underline"
              >
                Open the blog
                <ArrowRightIcon className="size-4" aria-hidden />
              </Link>
            </div>
          )}
        </div>
      </div>
    </SectionShell>
  );
}
