export default function WikiPageLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6">
      <div className="h-4 w-24 rounded bg-muted" />
      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_24rem]">
        <div>
          <div className="h-12 max-w-3xl rounded bg-muted" />
          <div className="mt-4 h-6 max-w-2xl rounded bg-muted/70" />
          <div className="mt-10 space-y-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-4 rounded bg-muted/70" />
            ))}
          </div>
        </div>
        <div className="h-64 rounded-lg border border-border/80 bg-card" />
      </div>
    </div>
  );
}
