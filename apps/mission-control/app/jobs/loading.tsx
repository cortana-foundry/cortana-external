export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-48 animate-pulse rounded bg-muted/60" />
      <div className="h-4 w-72 animate-pulse rounded bg-muted/40" />
      <div className="rounded-lg border">
        <div className="flex gap-4 border-b p-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-4 w-20 animate-pulse rounded bg-muted/50" />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-4 border-b p-3 last:border-b-0">
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="h-4 w-20 animate-pulse rounded bg-muted/30" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
