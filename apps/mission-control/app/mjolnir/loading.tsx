export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-48 animate-pulse rounded bg-muted/60" />
      <div className="h-4 w-64 animate-pulse rounded bg-muted/40" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-6 space-y-3">
          <div className="h-5 w-32 animate-pulse rounded bg-muted/50" />
          <div className="h-16 animate-pulse rounded bg-muted/30" />
          <div className="h-4 w-48 animate-pulse rounded bg-muted/40" />
        </div>
        <div className="rounded-lg border p-6 space-y-3">
          <div className="h-5 w-32 animate-pulse rounded bg-muted/50" />
          <div className="h-16 animate-pulse rounded bg-muted/30" />
          <div className="h-4 w-48 animate-pulse rounded bg-muted/40" />
        </div>
      </div>
    </div>
  );
}
