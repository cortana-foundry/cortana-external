import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type ActionKey = "chaos-test" | "reflection-sweep" | "check-budget" | "force-heartbeat";

type HealthCheckResult = { name: string; passed: boolean; details: string };
type ReflectionItem = {
  id: number;
  title: string;
  status: string;
  completed_at: string | null;
  outcome: string | null;
};

const prettyJson = (value: unknown) => JSON.stringify(value, null, 2);

const formatNumber = (value: unknown) => {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return value.toFixed(2);
};

const formatDateTime = (value: unknown) => {
  const source = typeof value === "number" || typeof value === "string" ? value : null;
  if (source == null) return "—";
  const d = new Date(source);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
};

export function renderActionResult(action: ActionKey, data: unknown) {
  if (!data || typeof data !== "object") {
    return <pre className="text-xs leading-5">{prettyJson(data)}</pre>;
  }

  const payload = data as Record<string, unknown>;

  if (action === "chaos-test") {
    const checks = (payload.checks as HealthCheckResult[] | undefined) ?? [];
    return (
      <div className="space-y-2 font-mono text-xs leading-5">
        {checks.map((check: HealthCheckResult) => (
          <div key={check.name} className="rounded-md border border-border/60 bg-background/70 p-2">
            <div className={check.passed ? "text-emerald-300" : "text-destructive"}>
              {check.passed ? "PASS" : "FAIL"} · {check.name}
            </div>
            <div className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-muted-foreground">
              {typeof check.details === "string" && check.details.length > 200
                ? check.details.slice(0, 200) + "…"
                : check.details}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (action === "reflection-sweep") {
    const rows = (payload.reflections as ReflectionItem[] | undefined) ?? [];
    if (rows.length === 0) {
      return <p className="text-sm text-muted-foreground">No completed tasks in the last 24 hours.</p>;
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Completed</TableHead>
            <TableHead>Outcome</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row: ReflectionItem) => (
            <TableRow key={row.id}>
              <TableCell>{row.id}</TableCell>
              <TableCell className="max-w-[260px] truncate" title={row.title}>
                {row.title}
              </TableCell>
              <TableCell>{row.status}</TableCell>
              <TableCell>{row.completed_at ? new Date(row.completed_at).toLocaleString() : "—"}</TableCell>
              <TableCell className="max-w-[320px] truncate" title={row.outcome || ""}>
                {row.outcome || "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  if (action === "check-budget") {
    const budget = (payload.budget as Record<string, unknown> | undefined) ?? {};
    return (
      <pre className="overflow-x-auto rounded-md border border-border/60 bg-background/70 p-3 font-mono text-xs leading-5">
{`source: ${String(budget.source ?? "unknown")}
used: ${formatNumber(budget.used)}
remaining: ${formatNumber(budget.remaining)}
burnRate: ${formatNumber(budget.burnRate)}
checkedAt: ${formatDateTime(payload.checkedAt)}`}
      </pre>
    );
  }

  if (action === "force-heartbeat") {
    return (
      <pre className="overflow-x-auto rounded-md border border-border/60 bg-background/70 p-3 font-mono text-xs leading-5">
{`status: ok
message: ${String(payload.message ?? "Manual heartbeat inserted")}
timestamp: ${formatDateTime(payload.timestamp)}`}
      </pre>
    );
  }

  return <pre className="text-xs leading-5">{prettyJson(payload)}</pre>;
}

const HEARTBEAT_REFRESH_DELAYS_MS = [1000, 3000, 7000, 15000];

/**
 * Force-heartbeat success: dispatch optimistic floor + scheduled re-fetches so
 * the heartbeat hook accepts the new timestamp before the server confirms it.
 */
export function scheduleHeartbeatRefreshes(optimisticLastHeartbeatMs?: number) {
  if (typeof optimisticLastHeartbeatMs === "number" && Number.isFinite(optimisticLastHeartbeatMs)) {
    window.dispatchEvent(
      new CustomEvent("heartbeat-refresh", {
        detail: { optimisticLastHeartbeatMs },
      }),
    );
  }

  HEARTBEAT_REFRESH_DELAYS_MS.forEach((delayMs) => {
    window.setTimeout(() => window.dispatchEvent(new Event("heartbeat-refresh")), delayMs);
  });
}
