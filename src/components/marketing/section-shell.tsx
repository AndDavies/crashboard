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
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-10 max-w-4xl md:mb-14">
      {eyebrow ? (
        <p className="mb-4 text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="font-heading text-4xl leading-[1.02] font-light text-foreground md:text-6xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
          {description}
        </p>
      ) : null}
    </div>
  );
}
