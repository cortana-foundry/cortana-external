export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-48 animate-pulse rounded bg-muted/60" />
      <div className="h-4 w-96 animate-pulse rounded bg-muted/40" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-muted/50" />
        ))}
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-9 w-24 animate-pulse rounded bg-muted/40" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-lg bg-muted/30" />
    </div>
  );
}
