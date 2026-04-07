export default function Loading() {
  return (
    <div className="flex gap-4">
      <div className="w-56 shrink-0 space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-4 animate-pulse rounded bg-muted/40" style={{ width: `${50 + Math.random() * 50}%` }} />
        ))}
      </div>
      <div className="flex-1 space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted/60" />
        <div className="h-4 w-full animate-pulse rounded bg-muted/30" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-muted/30" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted/30" />
        <div className="h-40 animate-pulse rounded bg-muted/20" />
      </div>
      <div className="hidden w-44 shrink-0 space-y-2 lg:block">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-3 animate-pulse rounded bg-muted/30" style={{ width: `${50 + Math.random() * 50}%` }} />
        ))}
      </div>
    </div>
  );
}
