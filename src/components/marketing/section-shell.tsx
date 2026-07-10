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
        dense ? "py-12 md:py-16" : "py-16 md:py-24",
        className,
      )}
    >
      <div className="container-wide">{children}</div>
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
    <div className="mb-8 max-w-4xl md:mb-12">
      {eyebrow ? (
        <p className="eyebrow mb-4">{eyebrow}</p>
      ) : null}
      <h2 className="font-heading text-4xl leading-[1.02] font-semibold text-foreground md:text-5xl">
        {title}
      </h2>
      {accentRule ? (
        <span className="mt-5 block h-0.5 w-16 bg-accent" aria-hidden />
      ) : null}
      {description ? (
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
          {description}
        </p>
      ) : null}
    </div>
  );
}
