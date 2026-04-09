import { ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SectionCard, EmptyState } from "./shared";
import type { LogEntry } from "./shared";

export function LogsTab({ logs }: { logs: LogEntry[] }) {
  const severityVariant = (s: string) => {
    const n = s.toLowerCase();
    if (["critical", "error", "failed"].some((k) => n.includes(k))) return "destructive" as const;
    if (n.includes("warn")) return "warning" as const;
    if (["success", "ok", "done"].some((k) => n.includes(k))) return "success" as const;
    return "info" as const;
  };

  const timeFmt = new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  return (
    <div className="space-y-4">
      <SectionCard
        icon={<ScrollText className="h-4 w-4" />}
        title="System Logs"
        count={`${logs.length} entries`}
        subtitle="Last 24h · max 100"
      >
        {logs.length === 0 ? (
          <EmptyState message="No log entries in the last 24 hours." />
        ) : (
          <div className="space-y-1.5">
            {logs.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-border/50 bg-muted/10 p-3 transition-colors hover:bg-muted/20">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {timeFmt.format(new Date(entry.timestamp))}
                  </span>
                  <Badge variant={severityVariant(entry.severity)} className="text-[10px]">
                    {entry.severity}
                  </Badge>
                  <span className="font-mono text-[10px] text-muted-foreground">{entry.source}</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {entry.eventType.replaceAll("_", " ")}
                  </span>
                </div>
                <p className="mt-1 break-words text-sm text-foreground/90">{entry.message || entry.eventType}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
