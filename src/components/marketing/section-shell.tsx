import { cn } from "@/lib/utils";

type Props = {
  id?: string;
  className?: string;
  children: React.ReactNode;
  /** Tighter vertical rhythm for nested bands */
  dense?: boolean;
};

export function SectionShell({
  id,
  className,
  children,
  dense,
}: Props) {
  return (
    <section
      id={id}
      className={cn(
        "border-b border-border/80",
        dense ? "py-14 md:py-20" : "py-20 md:py-28",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">{children}</div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  accentRule = true,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  accentRule?: boolean;
}) {
  return (
    <div className="mb-10 max-w-4xl md:mb-14">
      {eyebrow ? (
        <p className="eyebrow mb-4 flex items-center gap-3">
          <span className="h-1 w-10 bg-accent" aria-hidden />
          {eyebrow}
        </p>
      ) : null}
      <h2 className="font-heading text-4xl leading-[1.02] font-semibold text-foreground md:text-6xl">
        {title}
      </h2>
      {accentRule ? (
        <span className="accent-rule mt-6" aria-hidden />
      ) : null}
      {description ? (
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
          {description}
        </p>
      ) : null}
    </div>
  );
}
