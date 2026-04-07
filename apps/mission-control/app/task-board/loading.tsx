export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-48 animate-pulse rounded bg-muted/60" />
      <div className="h-4 w-80 animate-pulse rounded bg-muted/40" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4">
            <div className="h-5 w-24 animate-pulse rounded bg-muted/50" />
            <div className="h-20 animate-pulse rounded bg-muted/30" />
            <div className="h-20 animate-pulse rounded bg-muted/30" />
            <div className="h-20 animate-pulse rounded bg-muted/30" />
          </div>
        ))}
      </div>
    </div>
  );
}
