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
        dense ? "py-14 md:py-20" : "py-16 md:py-24",
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
    <div className="mb-10 max-w-2xl md:mb-14">
      {eyebrow ? (
        <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="font-heading text-2xl font-semibold text-foreground md:text-3xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}
