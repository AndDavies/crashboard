type Props = {
  description?: string;
};

/** Placeholder body for dashboard routes until real tools ship. */
export function DashboardPlaceholder({ description }: Props) {
  return (
    <div className="space-y-3">
      {description ? (
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        This route is registered in the sidebar. Replace this page with your UI.
      </p>
    </div>
  );
}
