export default function Loading() {
  const sidebarWidths = ["72%", "88%", "64%", "91%", "69%", "83%"];
  const railWidths = ["56%", "82%", "68%", "74%"];

  return (
    <div className="flex min-h-[calc(100vh-12rem)] gap-4">
      <div className="w-56 shrink-0 space-y-3 rounded-xl border border-border/40 bg-card p-4 shadow-sm">
        {sidebarWidths.map((width, i) => (
          <div key={i} className="h-4 animate-pulse rounded bg-muted/40" style={{ width }} />
        ))}
      </div>
      <div className="flex-1 rounded-xl border border-border/40 bg-card p-6 shadow-sm">
        <div className="mx-auto flex min-h-[calc(100vh-16rem)] max-w-3xl flex-col space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted/60" />
        <div className="h-4 w-full animate-pulse rounded bg-muted/30" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-muted/30" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted/30" />
          <div className="h-32 animate-pulse rounded bg-muted/20" />
          <div className="h-4 w-11/12 animate-pulse rounded bg-muted/30" />
          <div className="h-4 w-4/5 animate-pulse rounded bg-muted/30" />
          <div className="flex-1 animate-pulse rounded-xl bg-muted/10" />
        </div>
      </div>
      <div className="hidden w-44 shrink-0 space-y-2 lg:block">
        {railWidths.map((width, i) => (
          <div key={i} className="h-3 animate-pulse rounded bg-muted/30" style={{ width }} />
        ))}
      </div>
    </div>
  );
}
