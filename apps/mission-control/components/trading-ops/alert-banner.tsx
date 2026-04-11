import { AlertTriangle } from "lucide-react";
import type { TradingOpsDashboardData } from "@/lib/trading-ops-contract";

export function AlertBanner({ data }: { data: TradingOpsDashboardData }) {
  const incidents = data.runtime.data?.incidents ?? [];
  const errorArtifacts = [data.market, data.runtime, data.workflow, data.canary, data.tradingRun].filter((a) => a.state === "error");
  const tradingRunFallback = data.tradingRun.badgeText === "fallback";
  const isCritical = errorArtifacts.length > 0;
  const incidentMessage = incidents.length > 0
    ? `${incidents[0].incidentType}: ${incidents[0].operatorAction}`
    : "";
  const message =
    isCritical
      ? `${errorArtifacts.length} artifact(s) in error state — check immediately`
      : incidentMessage
        ? incidentMessage
        : tradingRunFallback
          ? `trading_run_state_fallback: ${data.tradingRun.message}`
          : "Trading ops warning detected. Review runtime status.";

  return (
    <div className={`flex items-start gap-2 rounded-md px-3 py-1.5 text-xs font-medium ${isCritical ? "terminal-alert-critical" : "terminal-alert-warning"}`}>
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1 text-current">{message}</span>
    </div>
  );
}
