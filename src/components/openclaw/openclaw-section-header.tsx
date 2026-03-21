type Props = {
  title: string;
  description: string;
};

export function OpenClawSectionHeader({ title, description }: Props) {
  return (
    <div className="space-y-2 border-b border-border/80 pb-6">
      <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
        OpenClaw
      </p>
      <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground md:text-2xl">
        {title}
      </h2>
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
