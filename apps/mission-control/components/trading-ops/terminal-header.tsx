import { Badge } from "@/components/ui/badge";
import type { TradingOpsDashboardData } from "@/lib/trading-ops-contract";
import { formatRelativeAge } from "@/lib/format-utils";

export function TerminalHeader({ data }: { data: TradingOpsDashboardData }) {
  return (
    <section className="rounded-lg border border-border/70 bg-card/80 font-mono">
      <div className="flex items-center justify-between gap-3 px-3 py-2.5 md:px-4">
        <div className="flex items-center gap-2 md:gap-3">
          <h1 className="text-xs font-bold uppercase tracking-wider md:text-sm">Cortana Trading Ops</h1>
          <Badge variant="outline" className="text-[10px]">live</Badge>
        </div>
        <span className="text-[10px] text-muted-foreground">{formatRelativeAge(data.generatedAt)}</span>
      </div>
    </section>
  );
}
