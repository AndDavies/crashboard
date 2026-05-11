import { cn } from "@/lib/utils";

export function MarketingPageFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 md:py-20",
        className,
      )}
    >
      {children}
    </div>
  );
}
