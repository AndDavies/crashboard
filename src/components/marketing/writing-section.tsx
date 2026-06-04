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
          <figure className="technical-grid relative aspect-[4/3] overflow-hidden border border-border/80 bg-background">
            <Image
              src="/images/marketing/crashboard-writing.jpg"
              alt="Editorial desk with research notes and writing materials"
              fill
              sizes="(min-width: 1024px) 40vw, 100vw"
              className="object-cover opacity-70 grayscale"
            />
          </figure>
        </div>

        <div className="border border-border/80 bg-card/70">
          {hasPosts ? (
            <ul className="grid gap-px bg-border/80">
              {blogPosts.map((post) => (
                <li key={post.slug} className="bg-card/70">
                  <Link
                    href={`/blog/${post.slug}`}
                    className="group grid gap-4 p-5 outline-none motion-safe:transition-colors hover:bg-card focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:grid-cols-[1fr_auto]"
                  >
                    <div>
                      <h3 className="font-heading text-xl font-semibold text-foreground">
                        {post.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {post.description}
                      </p>
                    </div>
                    <ArrowRightIcon
                      className="mt-1 size-4 text-muted-foreground motion-safe:transition-transform motion-safe:group-hover:translate-x-1"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="max-w-xl p-6">
              <p className="eyebrow">Awaiting CMS content</p>
              <h3 className="mt-3 font-heading text-3xl leading-tight font-semibold text-foreground">
                The archive starts when there is something worth publishing.
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Until the CMS is feeding real essays, this section stays quiet.
                The wiki already has the source-backed notes that future posts
                will build from.
              </p>
              <Link
                href="/blog"
                className="group mt-6 inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-accent underline decoration-accent/40 decoration-2 underline-offset-4 hover:decoration-accent"
              >
                Open the blog
                <ArrowRightIcon
                  className="size-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-1"
                  aria-hidden
                />
              </Link>
            </div>
          )}
        </div>
      </div>
    </SectionShell>
  );
}
