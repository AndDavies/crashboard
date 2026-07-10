import { cn } from "@/lib/utils";

export function BlogPostBody({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "blog-content max-w-[44rem] text-base leading-8 text-foreground",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
