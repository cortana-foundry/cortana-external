export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="h-3 w-16 rounded bg-muted/50" />
          <div className="h-6 w-52 rounded bg-muted/50" />
        </div>
        <div className="h-5 w-20 rounded-full bg-muted/40" />
      </div>

      {/* Vitals row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border/40 bg-card/50 p-5">
          <div className="flex items-center gap-4">
            <div className="h-28 w-28 rounded-full border-4 border-muted/30" />
            <div className="flex-1 space-y-3">
              <div className="h-3 w-20 rounded bg-muted/50" />
              <div className="h-5 w-16 rounded bg-muted/50" />
              <div className="h-3 w-24 rounded bg-muted/40" />
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border/40 bg-card/50 p-5">
          <div className="h-4 w-28 rounded bg-muted/50" />
          <div className="mt-4 space-y-3">
            <div className="h-10 w-full rounded bg-muted/40" />
            <div className="h-3 w-3/4 rounded bg-muted/40" />
          </div>
        </div>
      </div>

      {/* Training block */}
      <div className="rounded-xl border border-border/40 bg-card/50 p-4">
        <div className="h-4 w-32 rounded bg-muted/50" />
        <div className="mt-3 flex gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-16 flex-1 rounded-lg bg-muted/30" />
          ))}
        </div>
      </div>

      {/* PPL columns */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/40 bg-card/50 p-4">
            <div className="h-4 w-20 rounded bg-muted/50" />
            <div className="mt-3 space-y-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-12 w-full rounded-lg bg-muted/30" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
